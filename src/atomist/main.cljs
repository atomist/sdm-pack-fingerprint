(ns atomist.main
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [cljs-node-io.core :refer [slurp spit]]
            [cljs.core.async :refer [chan <! >!]]
            [clojure.pprint :refer [pprint]]
            [atomist.cljs-log :as log]
            [atomist.lein :as lein]
            [atomist.goals :as goals]
            [goog.string :as gstring]
            [goog.string.format]
            [atomist.fingerprints :as fingerprints]
            [atomist.promise :as promise]
            [hasch.core :as hasch]
            [atomist.logback :as logback]
            [atomist.public-defns :as public-defns]))

(defn ^:export voteResults
  [votes]
  (let [vs (-> votes
               (js->clj :keywordize-keys true)
               (->> (filter #(and (map? %) (:decision %)))))]
    (clj->js {:failed (boolean (some #(= "Against" (:decision %)) vs))
              :failedFps (->> vs
                              (filter #(= "Against" (:decision %)))
                              (map :name))
              :successFps (->> vs
                               (filter #(= "For" (:decision %)))
                               (map :name))
              :failedVotes (->> vs
                                (filter #(= "Against" (:decision %)))
                                (into []))})))

(defn ^:export sha256 [s]
  (clj->js (lein/sha-256 (js->clj s))))

;; ------------------------------

(defn ^:export depsFingerprints
  "maven and leiningen dependencies"
  [s]
  (fingerprints/fingerprint s))

(defn ^:export logbackFingerprints [s]
  (logback/fingerprint s))

(defn ^:export cljFunctionFingerprints [s]
  (public-defns/fingerprint s))


(defn ^:export applyFingerprint
  "apply maven, leiningen dep fingerprints, public defn bodies, and logback fingerprints
   returns Promise<boolean>"
  [basedir fp]
  (promise/chan->promise
   (go
     (let [clj-fp (js->clj fp :keywordize-keys true)]
       (log/info "apply fingerprint " clj-fp " to basedir " basedir)
      ;; currently sync functions but they should probably return channels
       (fingerprints/apply-fingerprint basedir clj-fp)
       (logback/apply-fingerprint basedir clj-fp))
     true)))

;; ------------------------------

(defn format-list [xs]
  (->> xs
       (map #(gstring/format "`%s`" %))
       (interpose ",")
       (apply str)))

(defn ^:export renderDiff [diff]
  (log/info "renderDiff" (with-out-str (cljs.pprint/pprint (js->clj diff :keywordize-keys true))))
  (let [event (js->clj diff :keywordize-keys true)
        {:keys [owner repo] {:keys [from to]} :data {fp-name :name} :from} event]
    (if (or from to)
      (gstring/format "%s\n%s/%s %s"
                      (str
                       (if from (gstring/format "removed %s" (format-list from)))
                       (if (and from to) ", ")
                       (if to (gstring/format "added: %s" (format-list to))))
                      owner repo fp-name))))

(defn ^:export renderOptions [options]
  (log/info "renderOptions" (with-out-str (cljs.pprint/pprint (js->clj options :keywordize-keys true))))
  (let [event (js->clj options :keywordize-keys true)]
    (with-out-str
      (pprint (->> (seq event)
                   (map (fn [x] [(:text x) (:value x)]))
                   (into {}))))))

(defn ^:export renderData [x]
  (let [event (js->clj x :keywordize-keys true)]
    (with-out-str
      (pprint event))))

(defn ^:export renderClojureProjectDiff [diff, target]
  (let [{:as d} (js->clj diff :keywordize-keys true)
        {:as t} (js->clj target :keywordize-keys true)]
    (clj->js
     {:title (gstring/format "New Library Target")
      :description (gstring/format
                    "Target version for library *%s* is *%s*.  Currently *%s* in *%s/%s*"
                    (-> d :to :data (nth 0))
                    (-> t :data (nth 1))
                    (-> d :to :data (nth 1))
                    (-> d :owner)
                    (-> d :repo))})))

(defn ^:export commaSeparatedList [x]
  (let [event (js->clj x :keywordize-keys true)]
    (apply str (interpose "," event))))

(defn ^:export consistentHash [edn]
  (.toString (hasch/uuid5 (hasch/edn-hash (js->clj edn)))))

(defn ^:export checkFingerprintTargets
  "check a project for whether it's dependencies are aligned with the current goals

   returns Promise<boolean>"
  [pref-query send-message confirm-goal diff]
  (promise/chan->promise
   (goals/check-fingerprint-goals pref-query send-message confirm-goal (js->clj diff :keywordize-keys true))))

(defn ^:export broadcastFingerprint
  "use fingerprints to scan for projects that could be impacted by this new lib version

   returns Promise<any>"
  [fingerprint-query fp cb]
  (promise/chan->promise
   (goals/broadcast-fingerprint fingerprint-query (js->clj fp :keywordize-keys true) cb)))

(defn noop [])

(set! *main-cli-fn* noop)
