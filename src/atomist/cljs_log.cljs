(ns atomist.cljs-log
  (:require [goog.string :as gstring]
            [goog.string.format]
            [cljs.pprint]
            [logger]))

(def logger (.-logger (js/automationClient)))
#_(def logger js/console)

(defn- log [& args]
  (try
    (.info logger (apply str args))
    (catch :default ex
      (.info js/console (apply str args)))))

(defn warn [& args]
  (try
    (.warn logger (apply str args))
    (catch :default ex
      (.warn js/console (apply str args)))))

(def info log)

(defn error [& args]
  (try
    (.error logger (apply str args))
    (catch :default ex
      (.error js/console (apply str args)))))

(defn debug [& args]
  (try
    (.debug logger (apply str args))
    (catch :default ex
      (.debug js/console (apply str args)))))

(defn infof [s & args]
  (info (apply gstring/format s args)))

(defn warnf [s & args]
  (warn (apply gstring/format s args)))

(defn errorf [ex s & args]
  (error (.-message ex))
  (error (apply gstring/format s args)))

(defn ptrace [x]
  (log (with-out-str (cljs.pprint/pprint x)))
  x)