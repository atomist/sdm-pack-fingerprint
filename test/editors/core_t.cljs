(ns editors.core-t
  (:require [cljs.test :refer-macros [deftest testing is run-tests]]
            [editors.core :as core]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [cljs.pprint :refer [pprint]]))

(deftest version-tests
  (testing "that we can extract the version from a project clj file"
    (is (= "1.1" (#'editors.core/get-version (slurp "test-resources/project1.clj")))))
  (testing "that we can update the version in a project clj file"
    (is (= "11.11" (#'editors.core/get-version (#'editors.core/update-version (slurp "test-resources/project1.clj") "11.11"))))))

(deftest name-tests
  (testing "that we can extract the version from a project clj file"
    (is (= "atomist/test" (#'editors.core/get-name (slurp "test-resources/project1.clj")))))
  (testing "that we can update the version in a project clj file"
    (is (= "atomist/test" (#'editors.core/get-name (#'editors.core/update-version (slurp "test-resources/project1.clj") "11.11"))))))

(def project2-deps '(("cljs-node-io" "0.5.0")
                     ("org.clojure/clojure" "1.8.0")
                     ("org.clojure/clojurescript" "1.9.946")
                     ("rewrite-cljs" "0.4.4")))

(deftest dependency-tests
  (testing "that we can extractgs dependency lists"
    (is (= project2-deps (#'editors.core/project-dependencies (slurp "test-resources/project2.clj"))))))
