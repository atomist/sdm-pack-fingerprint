(ns atomist.json
  (:require [http.util :refer [json-decode json-encode]]
            [cljs.nodejs :as nodejs]))

(comment
  (def render (.-render (nodejs/require "prettyjson"))))

(defn json->clj
  "JSON decode an object from `s`."
  [s & opts]
  (if-let [v (js/JSON.parse s)]
    (apply js->clj v opts)))

(defn clj->json
  [x & opts]
  (js/JSON.stringify (clj->js x) nil 2))

(defn read-str [s & args]
  (json-decode s))

(defn json-str [x & args]
  (json-encode x))
