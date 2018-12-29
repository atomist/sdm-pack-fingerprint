(ns atomist.cljs-log
  (:require [goog.string :as gstring]
            [goog.string.format]))

(defn- log [& args]
  (.info js/console (apply str args)))
(def warn log)
(def info log)
(def error log)

(defn infof [s & args]
  (info (apply gstring/format s args)))

(defn warnf [s & args]
  (warn (apply gstring/format s args)))

(defn errorf [ex s & args]
  (error (.-message ex))
  (error (apply gstring/format s args)))

(defn trace [x]
  (log (with-out-str (cljs.pprint/pprint x)))
  x)