(ns editors.cljfmt
  (:require [cljfmt.core]
            [cljs-node-io.core :as io :refer [slurp spit]]
            [clojure.pprint :refer [pprint]]
            [atomist.cljs-log :as log]))

(defn grep [re dir]
  (filter #(re-find re %) (io/file-seq dir)))

(defn find-files [dir]
  (let [f (io/file dir)]
    (if (.isDirectory f)
      (grep #"\.clj[sx]?$" dir)
      [f])))

(defn cljfmt
  "Format files with cljfmt"
  [dir]
  (log/info "call cljfmt on " dir)
  (let [files (find-files dir)
        wrote (atom false)]
    (log/infof "Checking %s files..." (count files))
    (doseq [f files
            :let [original (slurp f)]]
      (try
        (let [revised (cljfmt.core/reformat-string original)]
          (if (not= original revised)
            (do
              (log/info "Reformatting" f)
              (spit f revised)
              (log/info "Written...")
              (reset! wrote true))
            (log/info "No need to reformat" f)))
        (catch :default e
          (log/warn e "Failed to format file:  " f))))
    (if @wrote
      (do
        (log/info "Finished formatting")
        true)
      (log/info "No clojure files formatted"))))
