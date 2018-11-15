(ns atomist.npm
  (:require [semver]
            [rewrite-clj.zip :as z]
            [http.util :as util]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs-node-io.file :as file]
            [goog.crypt.Sha256 :as Sha256]
            [goog.crypt :as crypt]
            [cljs.pprint :refer [pprint]]
            [atomist.cljs-log :as log]
            [atomist.json :as json]
            [cljs.test :refer-macros [deftest testing is run-tests async] :refer [report testing-vars-str empty-env get-current-env]]
            [com.rpl.specter :as s :refer-macros [select transform]]
            [cljs-node-io.proc :as proc]
            [clojure.spec.alpha :as spec]
            [atomist.specs :as schema]))

(defn get-json [f]
  (->> (slurp f)
       (json/json->clj)))

(defn all-deps [x]
  (concat (or (get x "dependencies") [])
          (or (get x "devDependencies") [])))

(defn packages [f]
  (->> (get-json f)
       (all-deps)
       (seq)
       (map (fn [[k v]] [(str k) v]))))

(defn backpack-data [package-json]
  (->> (seq (-> package-json (get "backpack-react-scripts") (get "externals")))
       (filter (fn [[k v]] (#{"react" "react-dom"} k)))
       (map (fn [[k v]] [(str k) v]))))

(defn- spawn [basedir cmd & args]
  (log/info basedir cmd args)
  (let [{:keys [pid status output] :as process} (js->clj (proc/spawn-sync cmd args (if basedir {:cwd basedir} {})) :keywordize-keys true)]
    (log/infof "%d %d" pid status)
    (log/info (.toString (second output)))
    process))

(defn latest
  ""
  [package]
  (let [{:keys [status output]} (spawn nil "npm" "view" package)]
    (if (= 0 status)
      (let [buff (.toString (second output))]
        (or
         (second (re-find #"latest.*: (\S+)" buff))
         "unknown"))
      (do
        (log/error)
        "unknown"))))

(defn edit
  ""
  [{:keys [basedir path] :as f} {:keys [name version]}]
  (let [packagejson (io/file basedir path)]
    (when (.exists packagejson)
      (spawn basedir "npm" "install" (str name "@" version) "--save-exact"))))

(defn run [f]
  (try
    (log/info "package.json " f)
    (if-let [package-json (io/file f)]
      (if (.exists package-json)
        (let [json (get-json package-json)
              data (->> (packages package-json)
                        (into []))]
          (-> []
              (conj {:name "npm-project-deps"
                     :data data
                     :abbreviation "npm-deps"
                     :version "0.0.1"})
              (conj {:name "npm-project-coordinates"
                     :data {:name (get json "name")
                            :version (get json "version")}
                     :abbreviation "coords"
                     :version "0.0.1"})
              (conj {:name "backpack-react-scripts"
                     :data (backpack-data json)
                     :abbreviation "backpack"
                     :version "0.0.1"})))
        []))
    (catch :default e
      (log/info (str e))
      (log/info "error running fingerprintPackageJson")
      [])))
(spec/fdef run
           :args (spec/cat :file ::schema/file)
           :ret ::schema/fingerprints)
