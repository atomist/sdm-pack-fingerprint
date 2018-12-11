(ns atomist.npm-t
  (:require [cljs.test :refer-macros [deftest testing is run-tests use-fixtures]]
            [atomist.json :as json]
            [atomist.npm :as npm]
            [cljs.pprint :refer [pprint]]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [clojure.spec.test.alpha :as stest]))

(use-fixtures
 :once (fn [f]
         (cljs.test/update-current-env! [:formatter] (constantly pprint))
         (stest/instrument 'atomist.npm/apply-fingerprint)
         (f)))

(deftest npm-tests
  (let [f {:basedir "test-resources/npm" :path "package.json"}]
    (testing "fingerprints"
      (is (= [{:name "npm-project-deps"
               :data [["lib1" "v1"] ["@atomist/clj-editors" "v2"]]
               :abbreviation "npm-deps"
               :version "0.0.1"}
              {:name "npm-project-coordinates"
               :data {:name "name" :version "version"}
               :abbreviation "coords"
               :version "0.0.1"}
              #_{:name "backpack-react-scripts",
               :data '(["react" "v1"] ["react-dom" "v2"]),
               :abbreviation "backpack",
               :version "0.0.1"}]
             (npm/run (str (:basedir f) "/" (:path f))))
          "fingerprints for package.json are wrong")
      (is (= [{:name "npm-project-deps"
               :data [["lib1" "v1"] ["lib2" "v2"]]
               :abbreviation "npm-deps"
               :version "0.0.1"}
              {:name "npm-project-coordinates"
               :data {:name "name1" :version "version1"}
               :abbreviation "coords"
               :version "0.0.1"}
              #_{:name "backpack-react-scripts",
               :data (),
               :abbreviation "backpack",
               :version "0.0.1"}]
             (npm/run "test-resources/npm/package1.json"))
          "fingerprints for package1.json wrong"))
    (testing "the edit function"
      (with-redefs
       [npm/spawn (fn [& args] (is (= ["test-resources/npm" "npm" "install" "lib1@v2" "--save-exact"]
                                   args) "npm editor did not update the version"))]
       (npm/edit f {:name "lib1"
                    :version "v2"})))))

(deftest npm-editor-tests
  (testing "backpack editing"
    (with-redefs [spit (fn [f content]
                         (is (= {"dependencies" {"lib1" "v1", "@atomist/clj-editors" "v2"},
                                 "name" "name",
                                 "version" "version",
                                 "backpack-react-scripts"
                                 {"externals" {"react" "v3", "react-dom" "v4"}}}
                                (json/json->clj content))))]
                 (npm/apply-fingerprint
                  (io/file "./test-resources/npm/package.json")
                  {:name "backpack-react-scripts"
                   :data [["react" "v3"]
                          ["react-dom" "v4"]]}))))
