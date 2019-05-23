(ns atomist.public-defns
  (:require [rewrite-clj.zip :as z]
            [rewrite-clj.zip.whitespace :as w]
            [rewrite-clj.zip.base :as base]
            [rewrite-clj.zip.move :as m]
            [rewrite-clj.parser :as p]
            [rewrite-clj.node :as n]
            [rewrite-clj.node.protocols :as protocols]
            [rewrite-clj.zip.base :as base]
            [atomist.cljs-log :as log]
            [clojure.string :as str]
            [cljs-node-io.core :as io :refer [slurp spit file-seq]]
            [cljs-node-io.fs :as fs]
            [hasch.core :as hasch]
            [atomist.json :as json]
            [goog.string :as gstring]
            [goog.string.format]
            [cljs.spec.alpha :as spec]
            [rewrite-clj.node :as node]
            [rewrite-clj.parser.string]
            [rewrite-clj.node]))

(defn parse-regex
  "patch the parse-regex function in rewrite-cljs because cljs regular expression parsers are way more strict
   than the java one"
  [^not-native reader]
  (let [lines (#'rewrite-clj.parser.string/read-string-data reader)
        regex (clojure.string/join "\n" lines)]
    (try
      (rewrite-clj.node/token-node (re-pattern regex) (str "#\"" regex "\""))
      (catch :default ex
        (log/warn ex)
        (rewrite-clj.node/token-node (str "#\"" regex "\"") (str "#\"" regex "\""))))))

(defn- generate-sig
  "  params
        clj-path relative-path (string)
        dufn zloc of defn list form
        coll of zlocs occurring to the right of a 'defn symbol in a list
     returns
       nil on failure or "
  [clj-path dufn coll]
  ;; even if the symbol has metadata, the z/sexpr will remove the metadata and just leave the symbol
  (let [fn-name-sexpr (->> coll
                           (drop 1)
                           first
                           z/sexpr)]
    (try
      {:ns-name (-> clj-path
                    (fs/normalize-path)
                    (str/split #"\.")
                    first)

       :filename clj-path

       ;; should follow the rules fo symbol naming but this can break in macros
       :fn-name (name fn-name-sexpr)

       ;; get the node at this zloc and use the string function from the node protocols
       :bodies (z/string dufn)

       ;; hold on to the zloc for now but remove it before trying to print this
       :zloc dufn}
      (catch :default ex
        ;; one failure scenario occurs when the first sexpr following defn is not a symbol!
        ;; we are skipping these defns
        (log/warn ex)
        nil))))

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

(defn is-sym
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
  "true if the node to the right of the zloc is symbol metadata containing :fingerprint"
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
       (filter (is-sym 'defn))
       (filter start-of-list?)
       (filter fingerprint-metadata?)
       (map (partial public-sig clj-path))
       (filter identity)))

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
                 (log/warn (.-stack t)))))
       (filter identity)
       (map (fn [[clj-path zipper]]
              (try
                [(.relative fs/path (fs/normalize-path dir) clj-path) zipper]
                (catch :default t
                  (log/warn "clj-path " clj-path)))))
       (filter identity)
       (mapcat find-public-sigs)))

(defn- consistentHash [edn]
  (.toString (hasch/uuid5 (hasch/edn-hash (js->clj edn)))))

(defn- sha
  "Consistent hash of a function str
   return string"
  [somefn]
  (let [ast (z/root (z/of-string somefn))]
    (consistentHash (protocols/string ast))))

(defn- fingerprints
  "extract fingerprints from one .clj file
     returns "
  [f]
  (try
    (->>
     (for [dufn (all-defns f) :when (:fn-name dufn)]
       (try
         {:name (gstring/format "public-defn-bodies-%s" (:fn-name dufn))
          :sha (sha (:bodies dufn))
          :version "0.0.5"
          :abbreviation "defn-bodies"
          :data (dissoc dufn :zloc)}
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
      (with-redefs [rewrite-clj.parser.string/parse-regex parse-regex]
        (fingerprints f))
      (clj->js)
      (accept)))))
(spec/fdef fingerprint :args (spec/cat :dir string?))

(defn- replace-fn
  "Replace a function in file/zipper
     params
       zloc - zloc of top-level list node containing the list that needs updating
       fn-name - name of defn symbol to replace
       bodies - string function bodies"
  [zloc fn-name bodies]
  (z/replace
   zloc
   (p/parse-string bodies)))

(defn apply-fingerprint
  [f {:keys [name] {:keys [filename fn-name bodies ns-name]} :data}]
  (log/info "run the public-defn-bodies fingerprint application in " f)
  (try
    (if-let [dufn (->> (all-defns f)
                       (filter #(= fn-name (:fn-name %)))
                       first)]
      ;; found a fingerprinted function with the same name (possibly different namespace)
      (let [zloc (:zloc dufn)
            replaced (replace-fn zloc fn-name bodies)]
        (println "found location" (base/string zloc))
        (println "replaced" (base/string replaced))
        (if (= (base/string zloc) (base/string replaced))
          (log/warnf "%s was not replaced in %s as there is no change" fn-name filename)
          (do
            (log/infof "Writing new %s to %s - function coming from %s" fn-name (:filename dufn) filename)
            (println "shared" (base/root-string replaced))
            (spit (io/file f (:filename dufn)) (base/root-string replaced))
            true)))
      ;; no existing one found
      (let [f (io/file f filename)]
        (if (.exists f)
          (spit f (gstring/format "%s\n%s" (slurp f) bodies))
          (spit f (gstring/format "(ns %s)\n%s" ns-name bodies)))))
    (catch js/Error ex
      (.log js/console (.-stack ex))
      (log/error "failed apply fingerprint to " f))))
(spec/fdef apply-fingerprint :args (spec/cat :dir string? :fingerprint ::spec/fp))

(comment

 ;; working on this to fix shas
 (->> (z/of-string "(defn crap [] \"crap\")")
      (iterate z/next)
      (take-while identity)
      (take-while (complement m/end?))
      (map #(str (protocols/tag (z/node %)) " " (z/node %)))
      (cljs.pprint/pprint))

 ;; fix up the shas
 (cljs.pprint/pprint
  (with-redefs [rewrite-clj.parser.string/parse-regex parse-regex]
               (try
                 (->> (fingerprints "test-resources/cljs"))
                 (catch :default ex
                   (log/error (.-stack ex))))))

 (for [p ["pochta" "chatops-service" "bot-service" "neo4j-ingester" "org-service" "incoming-webhooks" "automation-api"]
         :let [project (str "/Users/slim/atomist/atomisthq/" p)]]
   [project (count (fingerprints project))])

 (apply-fingerprint "/Users/slim/atomist/slimslender/clj1" {:data {:filename "src/shared.clj"
                                                                   :fn-name "thing1"
                                                                   :bodies "(defn ^:fingerprint thing1 [] 8)"
                                                                   :ns-name "shared"}})

 )


