(ns atomist.npm-t
  (:require [cljs.test :refer-macros [deftest testing is run-tests]]
            [atomist.json :as json]
            [atomist.npm :as npm]
            [cljs.pprint :refer [pprint]]
            [cljs-node-io.core :as io :refer [slurp spit]]))

(deftest npm-tests
  (cljs.test/update-current-env! [:formatter] (constantly pprint))
  (let [f {:basedir "test-resources/npm" :path "package.json"}]
    (testing "fingerprints"
      (is (= [{:name "npm-project-deps"
               :data [["lib1" "v1"] ["@atomist/clj-editors" "v2"]]
               :abbreviation "npm-deps"
               :version "0.0.1"}
              {:name "npm-project-coordinates"
               :data {:name "name" :version "version"}
               :abbreviation "coords"
               :version "0.0.1"}]
             (npm/run (str (:basedir f) "/" (:path f))))
          "fingerprints are wrong")
      (is (= [{:name "npm-project-deps"
               :data [["lib1" "v1"] ["lib2" "v2"]]
               :abbreviation "npm-deps"
               :version "0.0.1"}
              {:name "npm-project-coordinates"
               :data {:name "name1" :version "version1"}
               :abbreviation "coords"
               :version "0.0.1"}]
             (npm/run "test-resources/npm/package1.json"))
          "fingerprints are wrong"))
    (testing "the edit function"
      (with-redefs
       [npm/spawn (fn [& args] (is (= ["test-resources/npm" "npm" "install" "lib1@v2" "--save-exact"]
                                   args) "npm editor did not update the version"))]
       (npm/edit f {:name "lib1" :version "v2"})))))

(comment
 (run-tests))