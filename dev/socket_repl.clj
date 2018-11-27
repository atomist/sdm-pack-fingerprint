(ns socket-repl
  (:require [cljs.repl :as repl]
            [cljs.repl.node :as node]
            [clojure.core.server :as server]))

(defn node-repl []
  (repl/repl (node/repl-env)
             :output-dir "out"
             :optimizations :none
             :cache-analysis true
             :source-map true))

(defn cljs-repl-server []
  (server/start-server
   {:port   7777
    :name   :cljs-socket-repl
    :accept 'socket-repl/node-repl}))

(cljs-repl-server)
(.. Thread currentThread join)
