(ns atomist.deps
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [clojure.data]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs-node-io.file :as file]
            [atomist.json :as json]
            [atomist.cljs-log :as log]
            [atomist.fingerprint :as clojure]
            [atomist.npm :as npm]
            [atomist.maven :as maven]
            [atomist.promise :refer [from-promise]]
            [cljs.pprint :refer [pprint]]
            [cljs.core.async :refer [chan <! >!]]
            [cljs.test :refer-macros [deftest testing is run-tests async] :refer [report testing-vars-str empty-env get-current-env]]
            [goog.string :as gstring]
            [goog.string.format]
            [atomist.lein :as lein]
            [cljs.spec.alpha :as spec]
            [atomist.specs :as schema]))

(defn- get-file [basedir path f]
  (if-let [file (io/file basedir path)]
    (if (.exists file)
      (f file))))

(defn- file-type [f]
  (cond
    (= (.getName f) "project.clj") :lein
    (= (.getName f) "pom.xml") :pom
    (= (.getName f) "package.json") :npm
    :else :unknown))

(defn- add-fingerprint [fp-name]
  (fn [x] (conj (into [] x) fp-name)))

(defn get-deps
  "returns ::deps"
  [basedir]
  (->> (concat
        (map (add-fingerprint "npm-project-deps") (get-file basedir "package.json" atomist.npm/packages))
        (map (add-fingerprint "clojure-project-deps") (get-file basedir "project.clj" atomist.fingerprint/project-dependencies))
        (map (add-fingerprint "maven-project-deps") (get-file basedir "pom.xml" maven/project-dependencies)))
       (into [])))
(spec/fdef get-deps
           :args (spec/cat :basedir string?)
           :ret ::schema/deps)

(defn get-fingerprint
  "extract library fingerprint data from a basedir containing some sort of project manifest and possibly
   a project lock file (depending on the system)

   returns promise of javascript Fingerprint[] or error "
  [basedir]
  (js/Promise.
   (fn [accept reject]
     (accept
      (let [data (concat
                  (get-file basedir "pom.xml" maven/run)
                  (get-file basedir "project.clj" clojure/run)
                  (get-file basedir "package.json" npm/run))]
        (->> data
             (map #(assoc %
                     :sha (clojure/sha-256 (json/json-str (:data %)))
                     :data (json/json-str (:data %))
                     :value (json/json-str (:data %))))
             (into [])
             (clj->js)))))))

(defn edit
  "edit a dependency in a project manifest
   synchronous call
   returns Any"
  [basedir n v]
  (get-file basedir "package.json" (fn [f] (npm/edit {:basedir basedir :path "package.json"} {:name n :version v})))
  (get-file basedir "project.clj" (fn [f] (spit f (lein/edit-library (slurp f) n v))))
  (get-file basedir "pom.xml" (fn [f] (maven/edit basedir n v))))

(defn apply-fingerprint
  ""
  [basedir {:keys [name] :as fingerprint}]
  (get-file basedir "package.json" (fn [f] (npm/apply-fingerprint f fingerprint))))
