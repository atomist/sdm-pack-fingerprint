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

(comment
 "the atomist:fingerprints:clojure:project-deps preferences is an application/json map of
 library goals.  The library goals is a map of library name to library goal

 for leiningen

 for npm

 for maven

 ")

(defn- pretty-log [t o]
  (log/info t ": " (with-out-str (pprint o))))

(defn- get-options
  "libs - set of lib dependencies in the current project [[name version fp-name] ...]
   goals - current set of library goals {name version}"
  [libs goals]
  (let [current-goals (->> goals keys (map name) set)]
    (log/info "current goals " current-goals)
    (->> (filter (fn [x] ((complement current-goals) (-> x first name))) libs)
         (map (fn [[symbol-name version & x]] {:text (gstring/format "%s %s" (name symbol-name) version)
                                               :value (gstring/format "%s:%s:%s" (name symbol-name) version (or (last x) "npm-project-deps"))}))
         (sort-by :text)
         (into []))))

(defn message [goals]
  (str "Current library targets:\n" (if (not-empty goals)
                                      (apply str
                                             (interpose "\n"
                                                        (map (fn [[k v]]
                                                               (gstring/format "*%s:%s*" (name k) v)) goals)))
                                      "NONE")))

(defn- preferences->goals
  "only supports reading from one scope right now because the writing function is not prioritized"
  [preferences type]
  (some-> preferences
          :ChatTeam
          first
          :preferences
          (->> (filter #(= (gstring/format "atomist:fingerprints:%s:project-deps" (or type "clojure")) (:name %))))
          first
          :value
          (json/json->clj)))

(defn- preferences->ignores
  "unscoped"
  [preferences type]
  (some-> preferences
          :ChatTeam
          first
          :preferences
          (->> (filter #(= "fingerprints.deps.ignore" (:name %))))
          first
          :value
          (json/json->clj)))

(defn- options
  "construct the set of options for with-project-goals messages"
  [preferences project-path type]
  (let [goals (preferences->goals preferences type)
        local-libs (deps/get-deps project-path)
        options (get-options local-libs goals)]
    (log/info "goals are " goals)
    [(message goals) options]))

(defn- prefs->options
  "returns library target preferences as a [{:text \"\" :value \"\"}]"
  [preferences type]
  (log/info "preferences" (with-out-str preferences))
  (->> (preferences->goals preferences type)
       (map (fn [[k v]] {:text k :value v}))
       (sort-by :text)
       (into [])))

(defn with-preferences
  "TODO - check for non-clojure project goals

   returns a callback with the value of the promise returned from the callback"
  [query-prefs callback]
  (go
   (let [preferences (<! (from-promise (query-prefs)))]
     (let [v (<! (from-promise (callback (clj->js (prefs->options preferences "clojure")))))]
       v))))

(defn with-project-goals
  "send a message about adding new library goals from the current project
   sendMessage about library targets from project which may contain lib dependencies

   TODO - check for non-clojure project goals

   params
    query-prefs - ()=>Promise
    project-path - basedir of current project
    send-message - callback to send a bot message

   returns a channel with the value of the promise returned by calling the send-message callback"
  [query-prefs project-path send-message]
  (go
   (let [preferences (<! (from-promise (query-prefs)))]
     (log/info "project should be in basedir " project-path)
     (let [[message options] (options preferences project-path "clojure")]
       (let [v (<! (from-promise (send-message message (clj->js options))))]
         v)))))

(defn with-new-goal
  "update a goal in the current project
   choose a new library target and set it in the team wide preferences

   TODO update all supported maps with these new goals

   params
     query-refs - ()=>Promise
     mutate-prefs - (team json)=>Promise
     parameters - {:keys [name version]} | string with name:version:fp-name

   returns a channel with the value of the promise returned by calling the mutate-prefs callback"
  [query-prefs mutate-prefs parameters]
  (go
   (let [[lib-name lib-version fp-name] (cond
                                          (map? parameters) [(:name parameters) (:version parameters)]
                                          (string? parameters) (drop 1 (re-find #"(.*):(.*):(.*)" parameters)))
         preferences (<! (from-promise (query-prefs)))
         chat-team-id (some-> preferences
                              :ChatTeam
                              first
                              :id)
         goals (preferences->goals preferences "clojure")]
     (pretty-log "Preference GraphQL query:  " preferences)
     (log/infof "-> %s/%s" lib-name lib-version)
     (log/info "update goals to " (json/json-str (assoc goals lib-name lib-version)))
     (let [v (<! (from-promise (mutate-prefs "atomist:fingerprints:clojure:project-deps" chat-team-id (json/json-str (assoc goals lib-name lib-version)))))]
       (log/info "mutation finished " v)
       v))))

(defn with-new-ignore
  "update an ignore in the current project
   choose a new library target and set it in the team wide preferences

   TODO update all supported maps with these new goals

   params
     query-refs - ()=>Promise
     mutate-prefs - (team json)=>Promise
     parameters - {:keys [name version]} | string

   returns a channel with the value of the promise returned by calling the mutate-prefs callback"
  [query-prefs mutate-prefs {:keys [owner repo] lib-name :name lib-version :version}]
  (go
   (let [preferences (<! (from-promise (query-prefs)))
         chat-team-id (some-> preferences
                              :ChatTeam
                              first
                              :id)
         ignores (preferences->ignores preferences "clojure")]
     (pretty-log "Preference GraphQL query:  " ignores)
     (let [new-ignores (json/json-str
                        (update-in ignores [owner repo lib-name]
                                   (fn [coll v] (conj (into #{} coll) v)) lib-version))]
       (log/info "update ignores to " new-ignores)
       (let [v (<! (from-promise (mutate-prefs chat-team-id new-ignores)))]
         (log/info "mutation finished " v)
         v)))))

(defn create-library-editor-choice
  "send a message if any libraries in the updated project are not the target versions
     event
     send-message
     action

   returns a channel containing the valuf of the callback (send-message) promise"
  [{:keys [owner repo channel-name] :as event}
   send-message
   {{:keys [name version] :as library} :library :as action}]
  (let [{:keys [current]} action]
    (go
     (log/info
      (<! (from-promise
           (send-message (str
                          (gstring/format "Target version for library *%s* is *%s*" name version)
                          "\n"
                          (gstring/format "Currently *%s* in <https://github.com/%s/%s|%s/%s>" current owner repo owner repo))
                         (clj->js action))))))))

(defn has-goal? [goals k]
  ((->> goals keys (map name) (into #{})) k))

(defn ignored? [ignores lib-name lib-version]
  ((set (get ignores lib-name)) lib-version))

(defn- check-library
  "check goals against lib versions extracted from file
     return goal library version and current version locally"
  [goals ignores & [n v & args]]
  (let [lib (name n)]
    (cond
      (and
       (has-goal? goals lib)
       (not (= v (get goals lib)))
       (not (ignored? ignores lib v)))
      {:library {:name lib :version (get goals lib)}
       :current v})))

(defn- check-libraries
  "returns a seq of channels containing the results of callback promises"
  [goals ignores {{to-data :data} :to :as event} f2]
  (->> to-data
       (map #(apply check-library goals ignores %))
       (filter identity)
       (map (partial create-library-editor-choice event f2))))

(defn check-library-goals
  "check a project for whether it's dependencies are aligned with the current goals
   send a message if any libraries in the updated project are not the target versions

   TODO use event to figure out which goal map to check - Diff event knows which fingerprint

   params
     query-prefs - graphql query for ChatTeam preferences
     send-message - bot message send function
     event - diff event from Push Impact

   returns channel which will have one value (:done) once all processing is finished"
  [query-prefs send-message {:keys [owner repo] :as event}]
  (go
   (let [preferences (<! (from-promise (query-prefs)))
         goals (preferences->goals preferences "clojure")
         ignores (preferences->ignores preferences "clojure")]
     (doseq [channel (check-libraries goals (get-in ignores [owner repo]) event send-message)]
       (println "check-library channel " (<! channel)))
     :done)))

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
                                        :fingerprints
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
                                        :fingerprints
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
          :ChatTeam
          first
          :preferences
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
             (clj->js fingerprint))))
       (<! (from-promise
            (confirm-goal (clj->js fingerprint))))))))

(defn get-fingerprint-preference
  "a fingerprint can itself be a preference and we must fetch it
   when it's time to apply it as an editor"
  [query-prefs fp-name]
  (go
   (let [preferences (<! (from-promise (query-prefs)))
         goal-fingerprint (get-fp-from-preferences preferences fp-name)]
     (log/info "get-fingerprint goal-fingerprint" goal-fingerprint)
     (clj->js goal-fingerprint))))

(defn set-fingerprint-preference
  "set or replace a fingerprint preference "
  [query-prefs query-fingerprint-by-sha pref-editor fp-name fp-sha]
  (go
   (let [preferences (<! (from-promise (query-prefs)))
         fps (<! (from-promise (query-fingerprint-by-sha fp-name fp-sha)))
         chat-team-id (-> preferences :ChatTeam first :id)
         fp (-> fps :Fingerprint first)
         fingerprint (assoc fp :data (-> fp :data (json/json->clj :keywordize-keys true)))]
     (log/info "set-fingerprint-preference to team " chat-team-id " and fingerprint " fingerprint)
     (if fingerprint
       (do
         (<! (from-promise (pref-editor fp-name chat-team-id (json/clj->json fingerprint))))
         true)
       false))))

(defn set-fingerprint-preference-from-json
  "set or replace a fingerprint preference "
  [query-prefs pref-editor fp-json]
  (go
   (let [preferences (<! (from-promise (query-prefs)))
         chat-team-id (-> preferences :ChatTeam first :id)
         fingerprint (json/json->clj fp-json :keywordize-keys true)]
     (log/info "set-fingerprint-preference for team " chat-team-id " and fingerprint " fingerprint " and set to " (:name fingerprint))
     (if fingerprint
       (do
         (<! (from-promise (pref-editor (:name fingerprint) chat-team-id (json/clj->json fingerprint))))
         true)
       false))))

(defn delete-fingerprint-preference
  "set or replace a fingerprint preference "
  [query-prefs pref-editor fp-name]
  (go
   (let [preferences (<! (from-promise (query-prefs)))
         chat-team-id (-> preferences :ChatTeam first :id)]
     (log/info "delete-fingerprint-preference on team " chat-team-id " and fingerprint " fp-name)
     (if fp-name
       (do
         (<! (from-promise (pref-editor fp-name chat-team-id "")))
         true)
       false))))
