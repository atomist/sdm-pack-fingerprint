(ns atomist.promise
  (:require-macros [cljs.core.async.macros :refer [go]])
  (:require [cljs.core.async :refer [chan <! >! close!]]
            [atomist.cljs-log :as log]))

(defn
  from-promise [promise]
  (let [c (chan)]
    (.catch
     (.then promise (fn [result]
                      (go (>! c (if result
                                  (js->clj result :keywordize-keys true)
                                  :done))
                          (close! c))))
     (fn [error]
       (log/error "problem with promise" error)
       (go (>! c {:failure error})
           (close! c))))
    c))

(defn chan->promise [chan]
  (js/Promise.
   (fn [accept reject]
     (go
       (try
         (let [v (<! chan)]
           (if v
             (do
               (log/info "clj-editors promise:  " v)
               (accept v))
             (reject v)))
         (catch :default t
           (log/error t " js Promise will reject")
           (log/error chan)
           (reject (clj->js {:fail "Promise rejected"
                             :error t}))))))))

(defn chan->obj-promise [chan]
  (js/Promise.
   (fn [accept reject]
     (go
      (try
        (let [v (<! chan)]
          (if v
            (accept (clj->js v))
            (reject (clj->js {:fail "empty chan value"}))))
        (catch :default t
          (log/error t " js Promise will reject")
          (log/error chan)
          (reject (clj->js {:fail "Promise rejected"
                            :error t}))))))))