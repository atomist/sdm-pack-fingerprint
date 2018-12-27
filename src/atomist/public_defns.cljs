(ns atomist.public-defns
  (:require [rewrite-clj.zip :as z]
            [rewrite-clj.zip.whitespace :as w]
            [rewrite-clj.zip.base :as base]
            [rewrite-clj.zip.move :as m]
            [rewrite-clj.parser :as p]
            [rewrite-clj.node :as n]
            [rewrite-clj.node.protocols :as protocols]
            [rewrite-clj.zip.base :as base]
            [cljs.nodejs :as nodejs]
            [atomist.cljs-log :as log]
            [clojure.string :as str]
            [cljs-node-io.core :as io :refer [slurp spit file-seq]]
            [cljs-node-io.fs :as fs]
            [hasch.core :as hasch]
            [atomist.json :as json]
            [goog.string :as gstring]
            [goog.string.format]
            [clojure.string :as s]))

(defn- generate-sig
  "  params
        clj-path relative-path (string)
        dufn zloc of defn list form
        coll of zlocs occurring to the right of a 'defn symbol in a list"
  [clj-path dufn coll]
  ;; even if the symbol has metadata, the z/sexpr will remove the metadata and just leave the symbol
  (let [fn-name (->> coll
                     (drop 1)
                     first
                     z/sexpr)]

    {:ns-name (-> clj-path
                  (fs/normalize-path)
                  (str/split #"\.")
                  first)
     :filename clj-path
     :fn-name fn-name
     :bodies (z/string dufn)}))

(defn- public-sig
  "collect zlocs to the right and including the zloc param
     params
      clj-path relative-path (string)
      zloc - zloc for 'defn symbol that occurs at the beginning of a list"
  [clj-path zloc]
  (->> zloc
       (iterate z/right)
       (take-while identity)
       (generate-sig clj-path (z/up zloc))))

(defn find-sym
  "return predicate function
      taking a zloc and truthy on whether this zloc has the symbol sym"
  [sym]
  (fn [x]
    (try
      (if (and
           (not (-> x z/node n/printable-only?))            ;; printable-only is true if this node doesn't have a valid sexpr
           (symbol? (base/sexpr x)))
        (= (name (base/sexpr x)) (name sym)))
      (catch :default t
        (if (not (= "Namespaced keywords not supported !" (.-message t)))
          (log/errorf t "find-sym:  can't check sexpr of " (z/node x))) false))))

(defn start-of-list?
  "check whether this zloc is a node at the head of a list"
  [zloc]
  (= :list (-> zloc z/up z/node n/tag)))

(defn fingerprint-metadata?
  ""
  [zloc]
  (let [symbol-loc (-> zloc z/right)]
    (and
     (= :meta (z/tag symbol-loc))
     (some #(or
             (= :fingerprint %)
             (and (map? %) (some #{:fingerprint} (keys %))))
           (base/child-sexprs symbol-loc)))))

(defn find-public-sigs
  "remove whitespace from all defn forms found in this zloc
   clj-path relativized path string
   zloc zipper representing all forms in module"
  [[clj-path zloc]]
  (->> zloc
       (iterate z/next)
       (take-while identity)
       (take-while (complement m/end?))
       (filter (find-sym 'defn))
       (filter start-of-list?)
       (filter fingerprint-metadata?)
       (map (partial public-sig clj-path))))

(defn find-all-named-fn-symbols-with-fingerprint-metadata
  "  params
       f - string path to file"
  [f]
  (->> (z/of-string (io/slurp f))
       (iterate z/next)
       (take-while identity)
       (take-while (complement m/end?))
       (filter (find-sym 'defn))
       (filter start-of-list?)
       (filter fingerprint-metadata?)
       (map (fn [zloc] (println (base/string (z/up zloc)))))))

(comment
 (find-all-named-fn-symbols-with-fingerprint-metadata "/Users/slim/repo/clj1/src/clj1/thing.clj")
 (find-all-named-fn-symbols-with-fingerprint-metadata "/Users/slim/repo/clj1/src/clj1/handler.clj"))


(defn all-clj-files
  "return seq of strings normalized by path module (resolves .. and .)"
  [dir]
  (->> (io/file-seq dir)
       (filter #(.endsWith (fs/basename %) ".clj"))))

(defn all-defns [dir]
  (->> (all-clj-files dir)
       sort
       (map #(try
               [(fs/normalize-path %) (z/of-string (io/slurp %))]
               (catch :default t
                 (log/warn (.-message t))
                 (log/warn "normalizing clj-path " %))))
       (filter identity)
       (map (fn [[clj-path zipper]]
              (try
                [(.relative fs/path (fs/normalize-path dir) clj-path) zipper]
                (catch :default t (log/warn "clj-path " clj-path)))))
       (filter identity)
       (mapcat find-public-sigs)))

(defn map-vec-zipper [m]
  (clojure.zip/zipper
   (fn [x] (or (map? x) (sequential? x)))
   seq
   (fn [p xs]
     (if (isa? (type p) clojure.lang.MapEntry)
       (into [] xs)
       (into (empty p) xs)))
   m))

(defn drop-nth
  "drop the nth member of this collection"
  [n coll]
  (->> coll
       (map vector (iterate inc 1))
       (remove #(zero? (mod (first %) n)))
       (map second)))

(defn consistentHash [edn]
  (.toString (hasch/uuid5 (hasch/edn-hash (js->clj edn)))))

(defn sha
  "Consistent hash of a function str
   return string"
  [somefn]
  (let [ast (z/root (z/of-string somefn))]
    (consistentHash (protocols/string ast))))

(defn- fingerprints [f]
  (try
    (->>
     (for [dufn (all-defns f) :when (:fn-name dufn)]
       (try
         {:name (gstring/format "public-defn-bodies-%s" (:fn-name dufn))
          :sha (sha (:bodies dufn))
          :version "0.0.4"
          :abbreviation "defn-bodies"
          :data (json/json-str dufn)
          :value (json/json-str dufn)}
         (catch :default t
           (log/errorf t "taking sha of %s body %s" (:filename dufn) (:bodies dufn)))))
     (filter identity)
     (into []))
    (catch :default t
      (log/warn "fingerprints exception " (.-message t))
      [])))

(defn fingerprint [f]
  "Public defns with their bodies, meta fully extracted"
  (log/info "run public defns on " f)
  (js/Promise.
   (fn [accept reject]
     (->>
      (fingerprints f)
      (clj->js)
      (accept)))))

(defn apply-fingerprint [f fp]
  )

(comment

 (def f "/Users/slim/atomist/atomisthq/bot-service")
 (def f "/Users/slim/repo/clj1")

 (for [dufn (all-defns f) :when (:fn-name dufn)]
   (try
     (cljs.pprint/pprint dufn)
     (catch :default t
       (log/errorf t "taking sha of %s body %s" (:filename dufn) (:bodies dufn)))))

 (def clj1 "/Users/slim/repo/clj1")
 (count (io/file-seq clj1))
 (all-clj-files clj1)
 (cljs.pprint/pprint (fingerprints clj1))

 (-> (z/of-string "(defn hey [] (#(println %) \"x\"))")
     (z/root)
     (protocols/sexpr))

 (cljs.pprint/pprint (fingerprints "/Users/slim/atomist_root/atomisthq/bot-service"))


 (z/of-string "(defn [] (#(println %) \"x\"))")

 (.catch
  (.then
   (fingerprint "/Users/slim/atomist_root/atomisthq/bot-service"
                #_"/Users/slim/repo/clj1")
   (fn [x] (log/info (count (js->clj x)))))
  (fn [x] (println "ERROR" x))))


