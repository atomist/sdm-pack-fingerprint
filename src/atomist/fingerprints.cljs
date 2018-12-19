(ns atomist.fingerprints
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [clojure.data]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs-node-io.file :as file]
            [atomist.json :as json]
            [atomist.cljs-log :as log]
            [atomist.lein :as lein]
            [atomist.maven :as maven]
            [atomist.promise :refer [from-promise]]
            [cljs.pprint :refer [pprint]]
            [cljs.core.async :refer [chan <! >!]]
            [cljs.test :refer-macros [deftest testing is run-tests async] :refer [report testing-vars-str empty-env get-current-env]]
            [goog.string :as gstring]
            [goog.string.format]
            [cljs.spec.alpha :as spec]
            [atomist.specs :as schema]
            [atomist.public-defns :as public-defns]))

(defn- get-file [basedir path f]
  (if-let [file (io/file basedir path)]
    (if (.exists file)
      (f file))))

(defn- file-type [f]
  (cond
    (= (.getName f) "project.clj") :lein
    (= (.getName f) "pom.xml") :pom
    :else :unknown))

(defn- add-fingerprint [fp-name]
  (fn [x] (conj (into [] x) fp-name)))

(defn get-deps
  "returns ::deps"
  [basedir]
  (->> (concat
        (map (add-fingerprint "clojure-project-deps") (get-file basedir "project.clj" lein/project-dependencies))
        (map (add-fingerprint "maven-project-deps") (get-file basedir "pom.xml" maven/project-dependencies)))
       (into [])))
(spec/fdef get-deps
           :args (spec/cat :basedir string?)
           :ret ::schema/deps)

(defn fingerprint
  "extract library fingerprint data from a basedir containing some sort of project manifest and possibly
   a project lock file (depending on the system)

   returns promise of javascript Fingerprint[] or error "
  [basedir]
  (js/Promise.
   (fn [accept reject]
     (accept
      (let [data (concat
                  (get-file basedir "pom.xml" maven/run)
                  (get-file basedir "project.clj" lein/run))]
        (->> data
             (map #(assoc %
                     :sha (lein/sha-256 (json/json-str (:data %)))
                     :data (json/json-str (:data %))
                     :value (json/json-str (:data %))))
             (into [])
             (clj->js)))))))

(defn apply-fingerprint
  "runs synchronously right now"
  [basedir {:keys [name] :as fingerprint}]

  (get-file
   basedir "pom.xml"
   (fn [f] (maven/apply-fingerprint f fingerprint)))

  (get-file
   basedir "project.clj"
   (fn [f]
     (cond

       (gstring/startsWith (:name fingerprint) "clojure-project-deps")
       (spit f (lein/edit-library (slurp f) (-> fingerprint :data (nth 0)) (-> fingerprint :data (nth 1)))))))

  (if (gstring/startsWith (:name fingerprint) "public-defn-bodies")
    (public-defns/apply-fingerprint basedir clj-fp)))
