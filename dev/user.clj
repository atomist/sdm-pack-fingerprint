(ns user
  (:require [cljs.repl :as repl]
            [tubular.core]
            [cljs.repl.node :as node]
            [cider.piggieback]))

(defn connect []
  (tubular.core/connect 7777))

(defn connect-node []
  (cider.piggieback/cljs-repl (node/repl-env :port 7777)))
