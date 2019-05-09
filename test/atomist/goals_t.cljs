(ns atomist.goals-t
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [clojure.data]
            [atomist.json :as json]
            [atomist.cljs-log :as log]
            [atomist.promise :refer [from-promise]]
            [cljs.pprint :refer [pprint]]
            [cljs.core.async :refer [chan <! >!]]
            [cljs.test :refer-macros [deftest testing is run-tests async] :refer [report testing-vars-str empty-env get-current-env]]
            [goog.string :as gstring]
            [goog.string.format]
            [atomist.goals :refer [broadcast check-fingerprint-goals]]))

(defn success-promise [m]
  (js/Promise. (fn [resolve] (resolve (clj->js m)))))

(defn failure-promise [e]
  (js/Promise. (fn [resolve error] (error (clj->js e)))))

(deftest empty-broadcast-tests
  (let [callback (atom 0)
        data {:Repo []}]
    (async done
      (go
       (done
        (is (= []
               (<! (broadcast
                    (fn [fp-name]
                      (is (= "npm-project-deps" fp-name))
                      (js/Promise.
                       (fn [resolve reject]
                         (resolve (clj->js data)))))
                    {:name "npm-test" :version "v2" :fp "npm-project-deps"}
                    (fn [owner name channel]
                      (swap! callback inc)
                      (success-promise {:done (str owner name channel)}))))))
        (is (= 0 @callback) "broadcast method should broadcast to one repo"))))))

(deftest broadcast-tests
  (testing "two repos but only one that requires a change"
    (let [callback (atom 0)
          data {:Repo [{:branches [{:commit {:fingerprints [{:name "npm-project-deps"
                                                             :data (json/json-str [["npm-test" "v1"]])}]}}]
                        :channels [{:id "ANBD24ZEC_CBVS0MT4N" :name "npm-test"}]
                        :name "npm-test"
                        :owner "slimslender"}
                       {:branches [{:commit {:fingerprints [{:name "npm-project-deps"
                                                             :data (json/json-str [["npm-test" "v2"]])}]}}]
                        :channels [{:id "ANBD24ZEC_CBW9RPH33" :name "npm1-test"}]
                        :name "npm1-test"
                        :owner "slimslender"}]}]
      (async done
        (go
         (done
          (is (= [{:done "slimslendernpm-testnpm-test"}]
                 (<! (broadcast
                      (fn [fp-name]
                        (is (= "npm-project-deps" fp-name))
                        (js/Promise.
                         (fn [resolve reject]
                           (resolve (clj->js data)))))
                      {:name "npm-test" :version "v2" :fp "npm-project-deps"}
                      (fn [owner name channel]
                        (swap! callback inc)
                        (is (= "slimslender" owner))
                        (is (= "npm-test" name))
                        (is (= "npm-test" channel))
                        (success-promise {:done (str owner name channel)}))))))
          (is (= 1 @callback) "broadcast method should broadcast to one repo")))))))

(deftest check-fingerprint-goals-tests
  (testing "different shas trigger a message"
    (let [fp-name "my-fingerprint"
          owner "owner"
          repo "repo"
          fp-current-goal {:name fp-name
                           :sha "sha1"
                           :data []}
          fp-to {:name fp-name
                 :sha "sha2"
                 :data []}]
      (async done
        (go
         (done
          (<! (check-fingerprint-goals
               (fn []
                 (js/Promise.
                  (fn [resolve reject]
                    (resolve (clj->js {:ChatTeam [{:preferences
                                                   [{:name fp-name
                                                     :value (json/clj->json fp-current-goal)}]}]})))))
               (fn [text fingerprint]
                 (is (= text "Target fingerprint *my-fingerprint* is *[]*\nCurrently *[]* in <https://github.com/owner/repo|owner/repo>"))
                 (is (= fp-to (js->clj fingerprint :keywordize-keys true)))
                 (js/Promise.
                  (fn [resolve reject]
                    (resolve :done))))
               (fn [fingerprint]
                 (is (= {:name fp-name :sha "sha2" :data []} (js->clj fingerprint)))
                 (js/Promise.
                  (fn [resolve reject]
                    (resolve :done))))
               {:owner owner
                :repo repo
                :to fp-to})))))))
  (testing "empty preferences for a fingerprint"
    (let [fp-name "my-fingerprint"
          owner "owner"
          repo "repo"
          fp-current-goal {:name fp-name
                           :sha "sha1"
                           :data []}
          fp-to {:name fp-name
                 :sha "sha2"
                 :data []}]
      (async done
        (go
         (done
          (<! (check-fingerprint-goals
               (fn []
                 (js/Promise.
                  (fn [resolve reject]
                    (resolve (clj->js {:ChatTeam [{:preferences
                                                   [{:name "something-else"
                                                     :value (json/clj->json fp-current-goal)}]}]})))))
               (fn [text fingerprint]
                 ;; should not be called
                 (js/Promise.
                  (fn [resolve reject]
                    (resolve :done))))
               (fn [fingerprint]
                 (is (= {:name fp-name :sha "sha2" :data []} (js->clj fingerprint :keywordize-keys true)))
                 (js/Promise.
                  (fn [resolve reject]
                    (resolve :done))))
               {:owner owner
                :repo repo
                :to fp-to}))))))))