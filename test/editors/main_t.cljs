(ns editors.main-t
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [clojure.test :refer [deftest run-tests is run-tests]]
            [spec-tools.visitor :as visitor]
            [cljs.spec.alpha :as s]
            [atomist.main]))

(deftest impact-tests
  (with-redefs [atomist.impact/process-push-impact
                (fn [event _ diff no-diff]
                  (is (= :event event))
                  (is (= [{:selector :a :action :b}] no-diff))
                  (go 0))]
    (atomist.main/processPushImpact
     :event
     (constantly "{}")
     [{:selector :a :action :b}]))
  (with-redefs [atomist.impact/process-push-impact
                (fn [event _ diff no-diff]
                  (is (= :event event))
                  (is (= [{:selector :a :action :c}] diff))
                  (go 0))]
    (atomist.main/processPushImpact
     :event
     (constantly "{}")
     [{:selector :a :diffAction :c}]))
  (with-redefs [atomist.impact/process-push-impact
                (fn [event _ diff no-diff]
                  (is (= :event event))
                  (is (= [{:selector :a :action :b}] no-diff))
                  (is (= [{:selector :a :action :c}] diff))
                  (go 0))]
    (atomist.main/processPushImpact
     :event
     (constantly "{}")
     [{:selector :a :action :b}
      {:selector :a :diffAction :c}])))
