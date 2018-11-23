(ns atomist.logback
  (:require [xml-js]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs.pprint]
            [atomist.json :as json]
            [com.rpl.specter :as s :refer-macros [select select-first transform]]
            [cljs.pprint :refer [pprint]]
            [atomist.cljs-log :as log]
            [cljs.test :refer-macros [deftest testing is run-tests async are] :refer [report testing-vars-str empty-env get-current-env]]
            [cljs.spec.alpha :as spec]
            [atomist.specs :as schema]
            [atomist.fingerprint :as fingerprint]))

(defn xml->clj [f]
  (-> (.xml2json xml-js (slurp f))
      (json/json->clj :keywordize-keys true)))

(defn clj->xml [x]
  (.js2xml xml-js (clj->js x) (clj->js {:spaces 2})))

(defn- element-name [s]
  (fn [x] (and
           (= "element" (:type x))
           (= s (:name x)))))

(defn- elk-appender []
  (fn [x] (and
           (= "element" (:type x))
           (= "appender" (:name x))
           (= "ELK" (-> x :attributes :name)))))

(def empty-configuration-element
  {:elements [{:type "element"
               :name "configuration"
               :attributes {:scan "true" :scanPeriod "30 seconds"}
               :elements []}]})

(defn- add-elk-appender [appender x]
  (println "transform " x)
  (s/transform [:elements s/ALL (element-name "configuration")] #(update-in % [:elements] conj appender) x))

(defn- logback-file-in-root [basedir]
  (io/file (str basedir "/resources/logback.xml")))

(defn- extract-fingerprint-data [dir]
  (let [f (logback-file-in-root dir)]
    (if (.exists f)
      (s/select-first [:elements s/ALL (element-name "configuration")
                       :elements s/ALL (elk-appender)] (xml->clj f))
      (throw (js/Error. "no logback file")))))
(spec/fdef extract-fingerprint :args (spec/cat :dir string?))

(defn- add-appender [xml f appender]
  (->> xml
       (add-elk-appender appender)
       (clj->xml)
       (spit f)))

(defn- no-root-configuration-element? [f]
  (->> (xml->clj f)
       (s/select-first [:elements s/ALL (element-name "configuration")])
       (nil?)))

(defn- insert-elk-appender
  [basedir appender]
  (let [f (logback-file-in-root basedir)]
    (cond
      (not (.exists f))
      (do
        (io/make-parents f)
        (add-appender empty-configuration-element f appender))
      (and (.exists f) (no-root-configuration-element? f))
      (throw (js/Error. "no root configuration element in logback.xml"))
      :else
      (add-appender (xml->clj f) f appender))))
(spec/fdef insert-elk-appender :args (spec/cat :dir string? :appender any?))

(defn fingerprint
  [basedir]
  (js/Promise.
   (fn [accept reject]
     (try
       (let [data (extract-fingerprint-data basedir)
             json-data (json/clj->json data)]
         (accept
          (clj->js
           [{:name "elk-logback"
             :version "0.0.1"
             :abbreviation "elk-logback"
             :sha (fingerprint/sha-256 json-data)
             :data json-data
             :value json-data}])))
       (catch js/Error ex
         (log/error "unable to generate elk-logback fingerprint" (.-name ex) (.-message ex))
         (reject []))))))
(spec/fdef insert-elk-appender :args (spec/cat :dir string?))

(defn apply-fingerprint
  "apply fingerprint
    called from atomist.main/apply-fingerprint - should complete synchronously without a Promise"
  [basedir {:keys [data name]}]
  (if (= "elk-logback" name)
    (try
      (insert-elk-appender basedir data)
      "completed successfully"
      (catch js/Error ex
        (log/error "unable to apply elk-logback fingerprint" (.-name ex) (.-message ex))
        (.-message ex)))))
(spec/fdef apply-fingerprint :args (spec/cat :dir string? :fingerprint ::spec/fp))

(comment
 (cljs.pprint/pprint (fingerprint "test-resources/logback"))
 (.then (fingerprint "test-resources/logback") (fn [x]
                                                 (cljs.pprint/pprint (js->clj x))))
 (.catch
  (.then (fingerprint "test")
         (fn [x]
           (cljs.pprint/pprint (js->clj x))))
  (fn [x] (println "ERROR " x)))
 (apply-fingerprint "tmp/logback" (fingerprint "test-resources/logback")))