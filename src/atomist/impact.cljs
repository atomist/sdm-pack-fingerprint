(ns atomist.impact
  "filter fingerprint impact events and run callbacks for diffs"
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [clojure.data]
            [atomist.json :as json]
            [atomist.cljs-log :as log]
            [cljs.pprint :refer [pprint]]
            [cljs.core.async :refer [chan <! >!]]
            [cljs.test :refer-macros [deftest testing is run-tests]]
            [cljs.core.async :as async]
            [atomist.promise :as promise]
            [cljs.spec.alpha :as s]))

(defn- push-impact?
  [x]
  (->> x
       (map #(second %))
       (apply +)
       (< 0)))

(defn get-team-id
  [o]
  ;; we also have (-> o :correlation_context :team :id
  (or (-> o :extensions :team_id)
      (-> o :team :id)))

(defn- get-repo-details [event]
  (cond
    (-> event :data :PushImpact)
    [(-> event :data :PushImpact first :push :after :repo :org :owner)
     (-> event :data :PushImpact first :push :after :repo :name)
     (-> event :data :PushImpact first :push :after :repo :channels first :name)]))

(defn- before-commit [event]
  (-> event :data :PushImpact first :push :before))

(defn- after-commit [event]
  (-> event :data :PushImpact first :push :after))

(defn- provider-id [event]
  (-> event :data :PushImpact first :push :after :repo :org :provider :providerId))

(defn- impact-id [event]
  (-> event :data :PushImpact first :id))

(defn- sha-impacts? [event]
  (some-> event :data :PushImpact first :data (json/read-str :key-fn keyword) push-impact?))

(defn- event->branch-name [event]
  (some-> event :data :PushImpact first :push :branch))

(defn- diff-fingerprint-data
  "diffs two collections of things"
  [fp-data1 fp-data2]
  (zipmap
   [:from :to]
   (clojure.data/diff
    (into #{} fp-data1)
    (into #{} fp-data2))))
(s/def ::from any?)
(s/def ::to any?)
(s/fdef diff-fingerprint-data
        :args (s/cat :first (s/map-of string? any?)
                     :second (s/map-of string? any?))
        :ret (s/keys :req-un [::from ::to]))

(defn- call-js [callback & args]
  (let [js-args (into-array (map clj->js args))]
    (.apply callback callback js-args)))

(defn- get-fingerprint-data [f sha name]
  (let [c1 (chan)
        p (f sha name)]
    (.catch
     (.then p (fn [x] (go (>! c1 (try
                                   (if x (json/read-str x) {})
                                   (catch :default t
                                     (log/info "failed to read json string from fingerprint data")
                                     {}))))))
     (fn [x] (go (>! c1 {:error x}))))
    c1))

(defn- diff-handler
  "calls all of the handlers for this one fingerprint
   each handlers has a selector to possibly skip this fingerprint, and an action, which is the handler

   returns channel
     channel yields value containing an array of :done, {:failure x}, or Vote maps
     failures to call handlers are logged"
  [handlers {:keys [get-fingerprint fp-name] :as event}]
  (go
   (let [filtered (->> (or handlers [])
                       (filter #(call-js (:selector %) event)))
         team-id (get-team-id event)
         [owner repo channel-name] (get-repo-details event)]
     (if (and owner repo (not (empty? filtered)))
       (let [from-data (<! (get-fingerprint-data get-fingerprint (:sha (before-commit event)) fp-name))
             to-data (<! (get-fingerprint-data get-fingerprint (:sha (after-commit event)) fp-name))
             data (diff-fingerprint-data from-data to-data)
             callbacks-reduced-channel
             (->> (map #(promise/from-promise
                         (call-js
                          (:action %)
                          (-> event
                              (assoc :data data
                                     :owner owner
                                     :repo repo
                                     :branch (event->branch-name event)
                                     :sha (:sha (after-commit event))
                                     :providerId (provider-id event)
                                     :channel channel-name)
                              (assoc-in [:from :data] from-data)
                              (assoc-in [:to :data] to-data)
                              (select-keys [:data :owner :repo :branch :channel :from :to :providerId :sha]))))
                       filtered)
                  (async/merge)
                  (async/reduce conj []))]
         (let [values (<! callbacks-reduced-channel)]
           values))
       (do
         (log/infof "%s skipped -> %s %s empty?->%s" fp-name owner repo (empty? filtered))
         [])))))

(defn- diff-fp
  "Check one fingerprint
     handlers are called only if the two fingerprints have different shas
     no-diff-handlers are called regardless

   this function offers the fingerprint to all handlers one after the other

   returns diff-handler channel"
  [{:keys [fp-name] :as event}]
  (let [from (->> event before-commit :fingerprints (some #(if (= fp-name (:name %)) %)))
        to (->> event after-commit :fingerprints (some #(if (= fp-name (:name %)) %)))
        o (assoc event :from from :to to)]
    (diff-handler (if (and from (not (= (:sha from) (:sha to))))
                    (concat (:handlers event) (:no-diff-handlers event))
                    (:no-diff-handlers event)) o)))

(defn- check-push-impact
  "wait for all channels to finish
   iterate over each after fingerprint and compute fingerprint diff

   returns channel with an array of arrays of :done || {:failure} || Vote
      top array is each fingerprint in the push impact and sub arrays are each active handler
      not all handlers will vote"
  [event]
  (->> (-> event after-commit :fingerprints)
       (map (fn [fp] (diff-fp
                      (assoc event
                        :name (:name fp)
                        :fp-name (:name fp)))))
       (async/merge)
       (async/reduce conj [])))

(defn process-push-impact
  "main entry point for dispatching handlers for Push Impact events
   returns a channel with an array of arrays (fingerprints X handlers)"
  [event get-fingerprint handlers no-diff-handlers]
  (check-push-impact (assoc event :get-fingerprint get-fingerprint :handlers handlers :no-diff-handlers no-diff-handlers)))
