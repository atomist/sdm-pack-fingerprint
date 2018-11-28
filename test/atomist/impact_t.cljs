(ns atomist.impact-t
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [cljs.core.async :refer [chan <! >!]]
            [cljs.test :refer-macros [deftest testing is run-tests async]]
            [atomist.impact :as impact]
            [atomist.json :as json]
            [cljs.pprint :refer [pprint]]))

(defn graphql-response [m]
  (fn [& args]
    (js/Promise. (fn [resolve] (resolve m)))))

(defn graphql-response-by-sha [m]
  (fn [sha _]
    (js/Promise. (fn [resolve] (resolve (get m sha))))))

(defn success-promise [m]
  (js/Promise. (fn [resolve] (resolve (clj->js m)))))

(defn failure-promise [e]
  (js/Promise. (fn [resolve error] (error (clj->js e)))))

(deftest diff-fingerprint-data-tests
  (is (=
       (#'atomist.impact/diff-fingerprint-data
        {"react" "v1"
         "react-dom" "v2"}
        {"react" "v1"
         "react-dom" "v2"})
       {:from nil :to nil}))
  (is (= (#'atomist.impact/diff-fingerprint-data
          {"react" "v0"
           "react-dom" "v2"}
          {"react" "v1"
           "react-dom" "v2"})
         {:from #{["react" "v0"]} :to #{["react" "v1"]}})))

(deftest process-push-test
  (let [whatever {:data
                  {:PushImpact
                   [{:id "push-impact-id"
                     :data "[[\"public-defn-bodies-whatever\",1]]"
                     :push {:after {:sha "commit-sha1"
                                    :fingerprints [{:name "public-defn-bodies-whatever" :sha "sha1"}]
                                    :author "author"
                                    :repo {:channels [{:name "commit-sha1"}]
                                           :name "repo"
                                           :org {:owner "org"}}}
                            :before {:sha "commit-sha2"
                                     :fingerprints [{:name "public-defn-bodies-whatever" :sha "sha2"}]}}}]}}
        whatever1 {:data
                   {:PushImpact
                    [{:id "push-impact-id"
                      :data "[[\"fp1\",1],[\"fp2\",0]]"
                      :push {:after {:sha "commit-sha1"
                                     :fingerprints [{:name "fp1" :sha "sha1"} {:name "fp2" :sha "sha3"}]
                                     :author "author"
                                     :repo {:channels [{:name "commit-sha1"}]
                                            :name "repo"
                                            :org {:owner "org"}}}
                             :before {:sha "commit-sha2"
                                      :fingerprints [{:name "fp1" :sha "sha2"} {:name "fp2" :sha "sha3"}]}}}]}}]

    (async done
      (go
       (done
        (testing "an empty event payload does nothing"
          (is (= [] (<! (impact/process-push-impact {} nil [] []))))
          (is (= [] (<! (impact/process-push-impact {} nil [{:selector (constantly true) :action (fn [& args] (throw js/Error))}] [])))))
        (testing "a PushImpact for a single fingerprint with a sha change"
          (is (= [["success"]] (<! (impact/process-push-impact
                                    whatever
                                    (graphql-response "{}")
                                    [{:selector (constantly true)
                                      :action (fn [x]
                                                (is (=
                                                     {:data {:from nil, :to nil}
                                                      :owner "org"
                                                      :repo "repo"
                                                      :channel "commit-sha1"
                                                      :sha "commit-sha1"
                                                      :providerId nil
                                                      :from {:name "public-defn-bodies-whatever", :sha "sha2", :data {}}
                                                      :to {:name "public-defn-bodies-whatever", :sha "sha1", :data {}}}
                                                     (-> x (js->clj :keywordize-keys true))))
                                                (success-promise :success))}]
                                    []))) "failed for empty graphql response")
          (is (= [["success"]] (<! (impact/process-push-impact
                                    whatever
                                    (graphql-response-by-sha
                                     {"commit-sha1" (json/json-str {:a "a"})
                                      "commit-sha2" (json/json-str {:b "b"})})
                                    [{:selector (constantly true)
                                      :action (fn [x]
                                                (is (=
                                                     {:data {:from [["b" "b"]], :to [["a" "a"]]}
                                                      :owner "org"
                                                      :repo "repo"
                                                      :channel "commit-sha1"
                                                      :sha "commit-sha1"
                                                      :providerId nil
                                                      :from {:name "public-defn-bodies-whatever", :sha "sha2", :data {:b "b"}}
                                                      :to {:name "public-defn-bodies-whatever", :sha "sha1", :data {:a "a"}}}
                                                     (-> x (js->clj :keywordize-keys true))))
                                                (success-promise :success))}]
                                    []))))
          (is (= [["success" "success" "success"]] (<! (impact/process-push-impact
                                                        whatever
                                                        (graphql-response "{}")
                                                        [{:selector (constantly true)
                                                          :action (fn [x]
                                                                    (is (=
                                                                         {:data {:from nil, :to nil}
                                                                          :owner "org"
                                                                          :repo "repo"
                                                                          :channel "commit-sha1"
                                                                          :sha "commit-sha1"
                                                                          :providerId nil
                                                                          :from {:name "public-defn-bodies-whatever", :sha "sha2", :data {}}
                                                                          :to {:name "public-defn-bodies-whatever", :sha "sha1", :data {}}}
                                                                         (-> x (js->clj :keywordize-keys true))))
                                                                    (success-promise :success))}
                                                         {:selector (constantly true)
                                                          :action (constantly (success-promise :success))}]
                                                        [{:selector (constantly true)
                                                          :action (constantly (success-promise :success))}])))))
        (testing "a PushImpact for a two fingerprints where only one has a real change"
          (is (= [[] ["success"]] (<! (impact/process-push-impact
                                       whatever1
                                       (graphql-response "{}")
                                       [{:selector (constantly true)
                                         :action (fn [x]
                                                   (is (=
                                                        {:data {:from nil, :to nil}
                                                         :owner "org"
                                                         :repo "repo"
                                                         :channel "commit-sha1"
                                                         :sha "commit-sha1"
                                                         :providerId nil
                                                         :from {:name "fp1", :sha "sha2", :data {}}
                                                         :to {:name "fp1", :sha "sha1", :data {}}}
                                                        (-> x (js->clj :keywordize-keys true))))
                                                   (success-promise :success))}]
                                       []))))
          (is (= [["success"] ["success" "success" "success"]] (<! (impact/process-push-impact
                                                                    whatever1
                                                                    (graphql-response "{}")
                                                                    [{:selector (constantly true)
                                                                      :action (fn [x]
                                                                                (is (=
                                                                                     {:data {:from nil, :to nil}
                                                                                      :owner "org"
                                                                                      :repo "repo"
                                                                                      :channel "commit-sha1"
                                                                                      :sha "commit-sha1"
                                                                                      :providerId nil
                                                                                      :from {:name "fp1", :sha "sha2", :data {}}
                                                                                      :to {:name "fp1", :sha "sha1", :data {}}}
                                                                                     (-> x (js->clj :keywordize-keys true))))
                                                                                (success-promise :success))}
                                                                     {:selector (constantly true)
                                                                      :action (constantly (success-promise :success))}]
                                                                    [{:selector (constantly true)
                                                                      :action (constantly (success-promise :success))}])))))
        (testing "a PushImpact for a fingerprint with a change and a failing Promise"
          (is (= [[] [{:failure "holy crap"}]] (<! (impact/process-push-impact
                                                    whatever1
                                                    (graphql-response "{}")
                                                    [{:selector (constantly true)
                                                      :action (fn [x]
                                                                (is (=
                                                                     {:data {:from nil, :to nil}
                                                                      :owner "org"
                                                                      :repo "repo"
                                                                      :channel "commit-sha1"
                                                                      :sha "commit-sha1"
                                                                      :providerId nil
                                                                      :from {:name "fp1", :sha "sha2", :data {}}
                                                                      :to {:name "fp1", :sha "sha1", :data {}}}
                                                                     (-> x (js->clj :keywordize-keys true))))
                                                                (failure-promise "holy crap"))}]
                                                    []))))))))))
