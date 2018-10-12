(ns atomist.encrypt
  (:require [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs-node-io.fs :as fs]
            [cljs.reader :refer [read-string]]
            [goog.json :as json]
            [cljs.core :refer [drop map?]]
            [clojure.string :as string :refer [split]]
            [clojure.pprint :refer [pprint]]
            [goog.crypt.base64 :as b64]
            [goog.string :as gstring]
            [goog.string.format]
            [goog.crypt :as crypt]
            [goog.crypt.Aes :as aes]))

(defn generate-key
  "generate a new key and write to key.txt"
  []
  (let [t (take 16 (repeatedly #(rand-int 20)))]
    (spit "key.txt" (print-str t))))

(defn read-key
  ([s]
   (->> (read-string s)
        (into [])
        (clj->js)
        (goog.crypt.Aes.)))
  ([] (read-key (slurp "key.txt"))))

(defn block-size [k]
  (.-BLOCK_SIZE k))

(defn s->blocks [n s]
  (->> (seq s)
       (map #(.charCodeAt % 0))
       (partition 16 16 (take 16 (repeat (.charCodeAt " " 0))))))

(defn encrypt [k s]
  (->>
   (s->blocks (block-size k) s)
   (map #(js->clj (.encrypt k (clj->js %))))
   (flatten)))

(defn decrypt [k cypher]
  (->>
   (partition 16 cypher)
   (map #(js->clj (.decrypt k (clj->js %))))
   (flatten)
   (map #(char %))
   (apply str)
   (gstring/trim)))

(defn encrypt-vault [m]
  (->> (pr-str m)
       (encrypt (read-key))
       (pr-str)
       (spit "vault.txt")))

(defn decrypt-vault []
  (->> (slurp "vault.txt")
       (read-string)
       (decrypt (read-key))
       (read-string)))

(defn- ->env [k]
  (-> (name k)
      (string/replace-all #"-" "_")
      (string/upper-case)))

(defn ->env-form [m]
  (->> (map (fn [[k v]] [(->env k) v]) m)
       (into {})))

(defn encrypted->clj [key s]
  (->> s
       (read-string)
       (decrypt (read-key key))
       (read-string)))

(defn vault-contents
  "  params
       key - string key
       vault - vault file"
  [key vault]
  {:pre [(fs/fexists? vault)]}
  (->> (slurp vault)
       (encrypted->clj key)
       (->env-form)))

(defn read-vault
  "
    returns unencrypted cljs map
    params
      f1 - key file
      f2 - vault file"
  [f1 f2]
  {:pre [(and (fs/fexists? f2) (fs/fexists? f1))]}
  (vault-contents (slurp f1) f2))

(defn or-empty-map [f k cipher]
  (try
    (f k cipher)
    (catch :default t
      {})))

(defn or-empty-string [f f1]
  (try
    (f f1)
    (catch :default t
      "")))

(defn edit-vault
  "run an edit function f on encrypted vault
    returns nil if successful
    params
      f1 - key file
      f2 - original vault file
      f3 - new vault file
      f - one-arg function to edit current vault"
  [f1 f2 f]
  {:pre [(fs/fexists? f1)]}
  (let [k (slurp f1)]
    (->> (or-empty-string slurp f2)
         (or-empty-map encrypted->clj k)
         (f)
         (pr-str)
         (encrypt (read-key k))
         (pr-str))))

(defn merge-vault
  "
    returns nil if successful
    params
      f1 - key file
      f2 - original vault file
      f3 - new vault file
      m - map to merge into vault"
  [f1 f2 m]
  {:pre [(map? m)]}
  (edit-vault f1 f2 (fn [v] (merge v m))))

(comment
  (pprint (read-vault "key.txt" "current-vault.txt"))
  (pprint (encrypted->clj (slurp "key.txt") (merge-vault "key.txt" "current-vault.txt" {:a "a"})))
  (pprint (read-vault "key.txt" "new-vault.txt")))
