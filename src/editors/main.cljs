(ns editors.main
  (:require [editors.core :as core]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs.analyzer :as cljs]
            [cljs.spec.alpha :as s]
            [clojure.pprint :refer [pprint]]
            [editors.cljfmt :as cljfmt]
            [atomist.cljs-log :as log]
            [atomist.encrypt :as encrypt]
            [atomist.impact :as impact]
            [atomist.fingerprint :as fingerprint]
            [atomist.npm :as npm]
            [atomist.goals :as goals]
            [http.util :as util]
            [goog.string :as gstring]
            [goog.string.format]
            [atomist.deps :as deps]
            [atomist.promise :as promise]
            [hasch.core :as hasch]))

(defn edit-file [f editor & args]
  (spit f (apply editor (slurp f) args)))

(defn ^:export setVersion [f version]
  (js/Promise.
   (fn [resolve reject]
     (try
       (if version
         (resolve (edit-file f core/update-version version))
         (reject "setVersion was called with a null version parameter"))
       (catch :default t
         (log/warn "unable to run setVersion " (str t))
         (reject t))))))

(s/fdef setVersion
        :args (s/cat :file string? :version string?))

(defn ^:export getName [f]
  (-> (slurp f)
      (core/get-name)))

(s/fdef getName
        :args (s/cat :file string?))

(defn ^:export getVersion [f]
  (-> (slurp f)
      (core/get-version)))

(s/fdef getVersion
        :args (s/cat :file string?))

(defn ^:export projectDeps [f]
  (-> (slurp f)
      (core/project-dependencies)
      clj->js))

(s/fdef projectDeps
        :args (s/cat :file string?))

(defn ^:export cljfmt [f]
  (js/Promise.
   (fn [resolve reject]
     (try
       (log/info "run cljfmt on " f)
       (resolve (cljfmt/cljfmt f))
       (catch :default e
         (log/warn "failure to run cljfmt " e)
         (reject e))))))

(defn ^:export vault [key f]
  (clj->js
   (encrypt/vault-contents key f)))

(s/fdef cljfmt
        :args (s/cat :file string?))

(defn ^:export updateProjectDep [f libname version]
  (edit-file f core/edit-library libname version))

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
    (log/info "processPushImpact " (count handlers) " " handlers)
    (log/info "processPushImpact " (with-out-str (cljs.pprint/pprint (js->clj event :keywordize-keys true))))
    (let [no-diff-handlers (->> handlers
                                (filter #(contains? % :action))
                                (map #(dissoc % :diffAction)))
          diff-handlers (->> handlers
                             (filter #(contains? % :diffAction))
                             (map #(-> %
                                       (assoc :action (:diffAction %))
                                       (dissoc :diffAction))))]
      (promise/chan->promise
       (impact/process-push-impact
        (js->clj event :keywordize-keys true)
        get-fingerprint
        diff-handlers
        no-diff-handlers)))))

(defn ^:export readVault [f1 f2]
  (clj->js
   (encrypt/read-vault f1 f2)))

(defn ^:export createKey []
  (log/info "creating a key in key.txt")
  (encrypt/generate-key))

(defn ^:export mergeVault
  [f1 f2 s]
  (encrypt/merge-vault f1 f2 (js->clj (util/json-decode s))))

(defn ^:export sha256 [s]
  (clj->js (fingerprint/sha-256 (js->clj s))))

(defn ^:export fingerprint [s]
  (deps/get-fingerprint s))

(defn ^:export edit [f1 n v]
  (deps/edit f1 n v))

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

(defn ^:export withNewIgnore
  "update a goal in the current project

   returns Promise<boolean>"
  [pref-query pref-editor library]
  (log/info "cj-editors withNewGoal")
  (promise/chan->promise
   (goals/with-new-ignore pref-query pref-editor (js->clj library :keywordize-keys true))))

(defn ^:export checkLibraryGoals
  "check a project for whether it's dependencies are aligned with the current goals

   returns Promise<boolean>"
  [pref-query send-message diff]
  (log/info "clj-editors checkLibraryGoals")
  (promise/chan->promise
   (goals/check-library-goals pref-query send-message (js->clj diff :keywordize-keys true))))

(defn ^:export broadcast
  "use fingerprints to scan for projects that could be impacted by this new lib version

   returns Promise<any>"
  [fingerprint-query lib cb]
  (log/info "clj-editors broadcast")
  (promise/chan->promise
   (goals/broadcast fingerprint-query (js->clj lib :keywordize-keys true) cb)))

(defn ^:export npmLatest
  ""
  [package]
  (log/info "clj-editors npm latest")
  (js/Promise.
   (fn [resolve reject]
     (try
       (resolve (npm/latest package))
       (catch :default e
         (log/warn "failure to run npm latest " e)
         (reject e))))))

(defn noop [])

(set! *main-cli-fn* noop)
