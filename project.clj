(defproject atomist.clj/fingerprints "0.5.7"
  :dependencies [[org.clojure/clojure "1.9.0"]
                 [org.clojure/clojurescript "1.10.238"]
                 [rewrite-cljs "0.4.4"]
                 [cljs-node-io "0.5.0"]
                 [noencore "0.1.16"]
                 [metosin/spec-tools "0.6.1"]
                 [org.clojure/test.check "0.10.0-alpha2"]
                 [cljfmt "0.5.7"]
                 [com.atomist/cljs-http "0.0.1"]
                 [com.rpl/specter "1.1.1"]
                 [io.replikativ/hasch "0.3.4"]]

  :plugins [[lein-cljsbuild "1.1.5"]
            [lein-doo "0.1.10"]
            [lein-set-version "0.4.1"]]

  :repositories [["releases" {:url      "https://sforzando.jfrog.io/sforzando/libs-release-local"
                              :username [:gpg :env/artifactory_user]
                              :password [:gpg :env/artifactory_pwd]}]
                 ["plugins" {:url      "https://sforzando.jfrog.io/sforzando/sforzando/plugins-release"
                             :username [:gpg :env/artifactory_user]
                             :password [:gpg :env/artifactory_pwd]}]]

  :profiles {:dev {:dependencies [[cider/piggieback "0.3.1"]
                                  [org.clojure/tools.nrepl "0.2.13"]
                                  [tubular "1.0.0"]]
                   :source-paths ["dev"]
                   :repl-options {:nrepl-middleware [cider.piggieback/wrap-cljs-repl]
                                  :init-ns user}}}
  :clean-targets
  [[:cljsbuild :builds 0 :compiler :output-to]
   [:cljsbuild :builds 0 :compiler :output-dir]
   :target-path
   :compile-path]
  :cljsbuild {:builds [{:id "prod"
                        :source-paths ["src"]
                        :compiler {:main editors.main
                                   :target :nodejs
                                   :output-to "fingerprints/main.js"
                                   :output-dir "out"
                                   :npm-deps {:xml-js "1.6.7"
                                              :semver "5.5.0"}
                                   :install-deps true
                                   :optimizations :simple
                                   :pretty-print true
                                   :parallel-build true}}
                       {:id "unit-tests"
                        :source-paths ["src" "test"]
                        :compiler {:output-to "unit-tests.js"
                                   :main editors.tests
                                   :target :nodejs
                                   :optimizations :none}}]}
  :release-tasks [["syncnpm"]
                  ["vcs" "commit"]
                  ["vcs" "push"]]
  :aliases {"deploy" "nothing"})
