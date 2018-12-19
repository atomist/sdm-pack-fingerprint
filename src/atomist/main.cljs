(ns atomist.main
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs.core.async :refer [chan <! >!]]
            [cljs.analyzer :as cljs]
            [cljs.spec.alpha :as s]
            [clojure.pprint :refer [pprint]]
            [atomist.cljs-log :as log]
            [atomist.impact :as impact]
            [atomist.lein :as lein]
            [atomist.goals :as goals]
            [http.util :as util]
            [goog.string :as gstring]
            [goog.string.format]
            [atomist.fingerprints :as fingerprints]
            [atomist.promise :as promise]
            [hasch.core :as hasch]
            [atomist.logback :as logback]
            [atomist.public-defns :as public-defns]
            [atomist.json :as json]))

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
              :diff (-> vs first :ballot)})))

(defn ^:export processPushImpact
  "process a PushImpact event by potentially fetching additional fingerprint data, creating diffs,
   and calling handler functions for certain kinds of fingerprints.

   params
     event - PushImpact event in JS Object form
     get-fingerprint - query function for additional fingerprint data (sha: string, name: string) => Promise<string>
     obj - JS Object containing handler functions

   returns Promise<boolean>"
  [event get-fingerprint obj]
  (let [handlers (js->clj obj :keywordize-keys true)]
    (let [no-diff-handlers (->> handlers
                                (filter #(contains? % :action))
                                (map #(dissoc % :diffAction)))
          diff-handlers (->> handlers
                             (filter #(contains? % :diffAction))
                             (map #(-> %
                                       (assoc :action (:diffAction %))
                                       (dissoc :diffAction))))]
      (promise/chan->obj-promise
       (impact/process-push-impact
        (js->clj event :keywordize-keys true)
        get-fingerprint
        diff-handlers
        no-diff-handlers)))))

(defn ^:export sha256 [s]
  (clj->js (lein/sha-256 (js->clj s))))

(defn ^:export depsFingerprints [s]
  (fingerprints/fingerprint s))

(defn ^:export logbackFingerprints [s]
  (logback/fingerprint s))

(defn ^:export cljFunctionFingerprints [s]
  (public-defns/fingerprint s))

(defn ^:export getFingerprintPreference [query-fn fp-name]
  (promise/chan->promise (goals/get-fingerprint-preference query-fn fp-name)))

(defn ^:export applyFingerprint
  "send fingerprint to all of our fingerprinting modules
   returns Promise<boolean>"
  [basedir fp]
  (log/info "apply fingerprint " fp " to basedir " basedir)
  (promise/chan->promise
   (go
    (let [clj-fp (js->clj fp :keywordize-keys true)]
      ;; currently sync functions but they should probably return channels
      (fingerprints/apply-fingerprint basedir clj-fp)
      (logback/apply-fingerprint basedir clj-fp))
    true)))

(defn ^:export list
  ""
  [x]
  (log/info "list " (js->clj x :keywordize-keys true))
  (-> x
      (js->clj :keywordize-keys true)
      :Repo
      first
      :branches
      first
      :commit
      :fingerprints))

(defn ^:export fpPreferences
  ""
  [query]
  (->>
   (-> query
       (js->clj :keywordize-keys true)
       :ChatTeam
       first
       :preferences)
   (map (fn [{:keys [name value]}]
          (try
            (json/json->clj value :keywordize-keys true)
            (catch :default x
              (log/error "preference value is not json " x)))))
   (filter (fn [x] (and x (contains? x :name) (contains? x :sha) (contains? x :data))))
   (into [])
   (clj->js)))

(defn ^:export fpPreference
  ""
  [query fp-name]
  (->> (js->clj (fpPreferences query) :keywordize-keys true)
       (some (fn [x] (if (= fp-name (:name x)) x)))
       (clj->js)))

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

(defn ^:export commaSeparatedList [x]
  (let [event (js->clj x :keywordize-keys true)]
    (apply str (interpose "," event))))

(defn ^:export consistentHash [edn]
  (.toString (hasch/uuid5 (hasch/edn-hash (js->clj edn)))))

(defn ^:export withProjectGoals
  "send a message about adding new library goals from the current project

   returns Promise<boolean>"
  [pref-query basedir send-message]
  (log/info "clj-editors withProjectGoals")
  (promise/chan->promise
   (goals/with-project-goals pref-query basedir send-message)))

(defn ^:export withPreferences
  "callback with a an array of maps with {:keys [text value]} maps

   returns Promise<boolean>"
  [pref-query callback]
  (log/info "clj-editors with-preferences")
  (promise/chan->promise
   (goals/with-preferences pref-query callback)))

(defn ^:export withNewGoal
  "update a goal in the current project

   returns Promise<boolean>"
  [pref-query pref-editor pref-namespace lib-goal]
  (log/info "cj-editors withNewGoal")
  (promise/chan->promise
   (goals/with-new-goal pref-query pref-editor (js->clj lib-goal :keywordize-keys true))))

(defn ^:export setGoalFingerprint
  "update a goal in the current project

   returns Promise<boolean>"
  [pref-query query-fingerprint-by-sha pref-editor fp-name fp-sha]
  (log/info "withGoalFingerprint")
  (promise/chan->promise
   (goals/set-fingerprint-preference pref-query query-fingerprint-by-sha pref-editor fp-name fp-sha)))

(defn ^:export setTargetFingerprint
  "update a goal in the current project

   returns Promise<boolean>"
  [pref-query pref-editor fp-json]
  (promise/chan->promise
   (goals/set-fingerprint-preference-from-json pref-query pref-editor fp-json)))

(defn ^:export withNewIgnore
  "update a goal in the current project

   returns Promise<boolean>"
  [pref-query pref-editor library]
  (log/info "withNewGoal")
  (promise/chan->promise
   (goals/with-new-ignore pref-query pref-editor (js->clj library :keywordize-keys true))))

(defn ^:export checkLibraryGoals
  "check a project for whether it's dependencies are aligned with the current goals

   returns Promise<boolean>"
  [pref-query send-message diff]
  (promise/chan->promise
   (goals/check-library-goals pref-query send-message (js->clj diff :keywordize-keys true))))

(defn ^:export checkFingerprintTargets
  "check a project for whether it's dependencies are aligned with the current goals

   returns Promise<boolean>"
  [pref-query send-message confirm-goal diff]
  (promise/chan->promise
   (goals/check-fingerprint-goals pref-query send-message confirm-goal (js->clj diff :keywordize-keys true))))

(defn ^:export broadcast
  "use fingerprints to scan for projects that could be impacted by this new lib version

   returns Promise<any>"
  [fingerprint-query lib cb]
  (log/info "clj-editors broadcast")
  (promise/chan->promise
   (goals/broadcast fingerprint-query (js->clj lib :keywordize-keys true) cb)))

(defn ^:export broadcastFingerprint
  "use fingerprints to scan for projects that could be impacted by this new lib version

   returns Promise<any>"
  [fingerprint-query fp cb]
  (promise/chan->promise
   (goals/broadcast-fingerprint fingerprint-query (js->clj fp :keywordize-keys true) cb)))

(defn noop [])

(set! *main-cli-fn* noop)
