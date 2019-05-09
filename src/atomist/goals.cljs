(ns atomist.goals
  "after determining that there has been a fingerprint impact,
   process incoming fingerprint impacts against the graph.
   We don't alter any files here (just query the graph and run callbacks)"
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [clojure.data]
            [atomist.json :as json]
            [atomist.cljs-log :as log]
            [atomist.promise :refer [from-promise]]
            [atomist.fingerprints :as deps]
            [cljs.pprint :refer [pprint]]
            [cljs.core.async :refer [chan <! >!]]
            [cljs.test :refer-macros [deftest testing is run-tests async] :refer [report testing-vars-str empty-env get-current-env]]
            [goog.string :as gstring]
            [goog.string.format]
            [atomist.promise :as promise]
            [cljs.core.async :as async]))

(defn broadcast-fingerprint
  "use fingerprints to scan for projects that could be impacted by this new lib version
   fire callbacks for all projects consuming a library when a new library target is set

   params
     complete-callback - zero-arg callback which fulfills a Promise
     graph-promise - get repos with a particular fingerprint
     target-library - here's the target library that projects might want to use
     callback - this is the callback to use when we find a project to notify

   returns channel with result
     but the complete-callback might complete the outside promise chain and should be the last thing called"
  [graph-promise {fp-name :name fp-sha :sha} callback]
  (go
   (let [graph-data (<! (from-promise (graph-promise fp-name)))
         owner-name-channels
         (->>
          (for [repo (:Repo graph-data)]
            (let [{:keys [name owner channels branches]} repo
                  channel (-> channels first :name)
                  fingerprint-sha (->> branches
                                        first
                                        :commit
                                        :analysis
                                        (filter #(= fp-name (:name %)))
                                        first
                                        :sha)]
              (if (and fingerprint-sha (= fp-sha fingerprint-sha))
                (log/info (gstring/format "found identical version of %s in %s" fp-name name))
                {:owner owner :name name :channel channel})))
          (filter identity))]
     (log/info "need to send to callbacks " owner-name-channels)
     (let [callback-return-values
           (<! (->> (for [{:keys [owner name channel]} owner-name-channels]
                      (promise/from-promise (callback owner name channel)))
                    (async/merge)
                    (async/reduce conj [])))]
       (log/info "callback returns" callback-return-values)
       callback-return-values))))

(defn broadcast
  "use fingerprints to scan for projects that could be impacted by this new lib version
   fire callbacks for all projects consuming a library when a new library target is set

   params
     complete-callback - zero-arg callback which fulfills a Promise
     graph-promise - get repos with a particular fingerprint
     target-library - here's the target library that projects might want to use
     callback - this is the callback to use when we find a project to notify

   returns channel with result
     but the complete-callback might complete the outside promise chain and should be the last thing called"
  [graph-promise {:keys [name version fp]} callback]
  (go
   (let [fp-name fp
         graph-data (<! (from-promise (graph-promise fp-name)))
         lib-name name
         owner-name-channels
         (->>
          (for [repo (:Repo graph-data)]
            (let [{:keys [name owner channels branches]} repo
                  channel (-> channels first :name)
                  fingerprint-data (->> branches
                                        first
                                        :commit
                                        :analysis
                                        (filter #(= fp-name (:name %)))
                                        first
                                        :data
                                        (json/json->clj)
                                        (into {}))]
              (if-let [v (get fingerprint-data lib-name)]
                (if-not (= version v)
                  {:owner owner :name name :channel channel}
                  (log/info (gstring/format "found identical version of %s in" name)))
                (log/info (gstring/format "fingerprint data for %s/%s does not contain library %s" owner name lib-name)))))
          (filter identity))]
     (log/info "need to send to callbacks " owner-name-channels)
     (let [callback-return-values
           (<! (->> (for [{:keys [owner name channel]} owner-name-channels]
                      (promise/from-promise (callback owner name channel)))
                    (async/merge)
                    (async/reduce conj [])))]
       (log/info "callback returns" callback-return-values)
       callback-return-values))))

;;----------------------------
;; fingerprint goals
;;----------------------------

(defn- get-fp-from-preferences
  "ChatTeam preferences may contain a fingerprint goal"
  [preferences fp-name]
  (some-> preferences
          :TeamConfiguration
          (->> (filter #(= fp-name (:name %))))
          first
          :value
          (json/json->clj :keywordize-keys true)))

(defn check-fingerprint-goals
  "check current fingerprint for whether it's in sync with with the goal fingerprint
     - if there is no goal fingerprint then we should not run the callback
     - "
  [query-prefs send-message confirm-goal {:keys [owner repo] fingerprint :to}]
  (go
   (let [preferences (<! (from-promise (query-prefs)))
         fp-goal (get-fp-from-preferences preferences (:name fingerprint))]
     (if (and
          fp-goal
          (not
           (= (:sha fingerprint) (:sha fp-goal))))
       (<! (from-promise
            (send-message
             (str
              (gstring/format "Target fingerprint for *%s* has changed." (:name fp-goal))
              "\n"
              (gstring/format "<https://github.com/%s/%s|%s/%s>"
                              owner repo owner repo))
             (clj->js fp-goal)
             (clj->js fingerprint))))
       (<! (from-promise
            (confirm-goal (clj->js fingerprint))))))))

