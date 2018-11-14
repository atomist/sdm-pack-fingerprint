(ns atomist.lein
  (:require [cljs.reader :refer [read-string]]
            [rewrite-clj.parser :as p]
            [rewrite-clj.node :as n]
            [rewrite-clj.zip :as z]
            [cljs.nodejs :as nodejs]))

(defn edit-library [s library-name library-version]
  (-> s
      (z/of-string)
      z/down
      (z/find-next-value :dependencies)
      (z/find z/next #(if-let [s (z/sexpr %)]
                        (and (symbol? s)
                             (= library-name (str s)))))
      (z/right)
      (z/edit (constantly library-version))
      (z/root-string)))