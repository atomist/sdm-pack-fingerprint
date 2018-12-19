(ns atomist.deps-t
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [clojure.data]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs-node-io.file :as file]
            [atomist.json :as json]
            [atomist.cljs-log :as log]
            [atomist.maven :as maven]
            [atomist.promise :refer [from-promise]]
            [cljs.pprint :refer [pprint]]
            [cljs.core.async :refer [chan <! >!]]
            [cljs.test :refer-macros [deftest testing is run-tests async] :refer [report testing-vars-str empty-env get-current-env]]
            [goog.string :as gstring]
            [goog.string.format]
            [atomist.lein :as lein]
            [atomist.fingerprints :refer [fingerprint get-deps]]))

(deftest deps-tests
  (cljs.test/update-current-env! [:formatter] (constantly pprint))
  (let [fix (fn [xs] (into [] (map #(assoc % :value (:data %)) xs)))
        test-fps [{:name "clojure-project-coordinates"
                   :data "{\"name\":\"atomist/test\",\"version\":\"1.1\"}"
                   :abbreviation "coords"
                   :version "0.0.1"
                   :sha
                   "9aaf3127495dc3d2f29f161251b372511081cb907f50cbcd00f4e070f1db313b"}
                  {:name "clojure-project-deps::cljs-node-io",
                   :data "[\"cljs-node-io\",\"0.5.0\"]",
                   :abbreviation "lein-deps",
                   :version "0.0.1",
                   :sha
                   "8f05862f4d93bbc68961bf4de10dea0b17be3603c0c703b65e592652a3ba9c0f",
                   :value "[\"cljs-node-io\",\"0.5.0\"]"}
                  {:name "clojure-project-deps::org.clojure::clojurescript",
                   :data "[\"org.clojure/clojurescript\",\"1.10.238\"]",
                   :abbreviation "lein-deps",
                   :version "0.0.1",
                   :sha
                   "84d136c56efd625fb0bc6526e357abacd9e4c7c81ba4cbdb49a7268a49d3904c",
                   :value "[\"org.clojure/clojurescript\",\"1.10.238\"]"}]
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
                  (.catch
                   (.then
                    (fingerprint "test-resources/lein")
                    (fn [result]
                      (is (= (fix test-fps) (js->clj result :keywordize-keys true)))))
                   (fn [error] (println "errror" error)))))
             (<! (from-promise
                  (.then
                   (fingerprint "test-resources/maven")
                   (fn [result]
                     (is (= (fix test-maven-fps) (js->clj result :keywordize-keys true)))))))
             (done)))))

(deftest get-deps-tests
  (cljs.test/update-current-env! [:formatter] (constantly pprint))
  (is (= [["cljs-node-io" "0.5.0" "clojure-project-deps"]
          ["org.clojure/clojurescript" "1.10.238" "clojure-project-deps"]] (get-deps "test-resources/lein")))
  (is (= [["cljs-node-io" "0.5.0" "clojure-project-deps"]] (get-deps "test-resources/cljs"))))

(comment
  (run-tests))
