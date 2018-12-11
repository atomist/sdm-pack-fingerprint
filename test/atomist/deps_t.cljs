(ns atomist.deps-t
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
            [atomist.deps :refer [get-fingerprint get-deps]]))

(deftest deps-tests
  (cljs.test/update-current-env! [:formatter] (constantly pprint))
  (let [fix (fn [xs] (into [] (map #(assoc % :value (:data %)) xs)))
        test-fps [{:name "clojure-project-deps"
                   :data "[[\"cljs-node-io\",\"0.5.0\"]]"
                   :abbreviation "lein-deps"
                   :version "0.0.1"
                   :sha
                   "5c5389d9717bc800a1198577d33692c154e50a4d3cc6681e691c49becf2e7228"}
                  {:name "clojure-project-coordinates"
                   :data "{\"name\":\"atomist/test\",\"version\":\"1.1\"}"
                   :abbreviation "coords"
                   :version "0.0.1"
                   :sha
                   "9aaf3127495dc3d2f29f161251b372511081cb907f50cbcd00f4e070f1db313b"}]
        test-npm-fps [{:name "npm-project-deps"
                       :data (json/json-str [["lib1" "v1"] ["@atomist/clj-editors" "v2"]])
                       :abbreviation "npm-deps"
                       :version "0.0.1"
                       :sha "3bfdc41a01cc1b2df4f5f5edc09846656dea669d1f2b9c5d5f77df748e56de71"}
                      {:name "npm-project-coordinates"
                       :data (json/json-str {:name "name" :version "version"})
                       :abbreviation "coords"
                       :version "0.0.1"
                       :sha "4aae388815805a3f589a060a9f02d30e8840cbeb620769bad381ec36b06c8b32"}
                      #_{:name "backpack-react-scripts"
                       :data (json/json-str [["react" "v1"] ["react-dom" "v2"]])
                       :abbreviation "backpack"
                       :version "0.0.1"
                       :sha "9cf71219a243f35743ed71b2054e1ba7ee90844de41cedd5d349058b6f53c1b7"}]
        test-maven-fps [{:name "maven-project-deps"
                         :data (json/json-str [["org.springframework.boot/spring-boot-starter-parent"
                                                "2.0.3.RELEASE"]
                                               ["com.amazonaws/aws-java-sdk-bom" "1.11.308"]
                                               ["com.google.guava/guava" "24.0-jre"]
                                               ["com.dealer.webplatform/jvms-spring-boot-starter" "2.6.4-SNAPSHOT"]
                                               ["com.dealer.webplatform/jvms-spring-boot-test" "2.6.4-SNAPSHOT"]])
                         :abbreviation "maven-deps"
                         :version "0.0.1"
                         :sha "9a355610a30a9c87fe637d8ac86c92609adacdce25753586ab4875c7e0d84279"}
                        {:name "maven-project-coordinates"
                         :data (json/json-str {:name "com.dealer.webplatform/jvms-parent-pom" :version "2.6.4-SNAPSHOT"})
                         :abbreviation "coords"
                         :version "0.0.1"
                         :sha "17f322e107948f0a6094de22c031bebb60fd0dbd42e3411e5a8bf574dbfc710b"}]]
    (async done
           (go
             (<! (from-promise
                  (.then
                   (get-fingerprint "test-resources/lein")
                   (fn [result]
                     (is (= (fix test-fps) (js->clj result :keywordize-keys true)))))))
             (<! (from-promise
                  (.then
                   (get-fingerprint "test-resources/npm")
                   (fn [result]
                     (is (= (fix test-npm-fps) (js->clj result :keywordize-keys true)))))))
             (<! (from-promise
                  (.then
                   (get-fingerprint "test-resources/maven")
                   (fn [result]
                     (is (= (fix test-maven-fps) (js->clj result :keywordize-keys true)))))))
             (done)))))

(deftest get-deps-tests
  (cljs.test/update-current-env! [:formatter] (constantly pprint))
  (is (= [["lib1" "v1" "npm-project-deps"] ["@atomist/clj-editors" "v2" "npm-project-deps"]] (get-deps "test-resources/npm")))
  (is (= [["cljs-node-io" "0.5.0" "clojure-project-deps"]] (get-deps "test-resources/lein")))
  (is (= [["lib1" "v1" "npm-project-deps"] ["lib2" "v2" "npm-project-deps"] ["cljs-node-io" "0.5.0" "clojure-project-deps"]] (get-deps "test-resources/cljs"))))

(comment
  (run-tests))
