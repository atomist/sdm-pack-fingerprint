(ns editors.tests
  (:require [cljs.test :refer-macros [deftest testing is run-tests run-all-tests async] :refer [report testing-vars-str empty-env get-current-env]]
            [editors.main-t]
            [atomist.npm-t]
            [atomist.impact-t]
            [atomist.goals-t]
            [atomist.deps-t]
            [doo.runner :refer-macros [doo-tests]]))

(defmethod cljs.test/report [:cljs.test/default :end-run-tests] [m]
  (if (cljs.test/successful? m)
    (println "Success!")
    (println "FAIL")))

(defmethod report [:cljs.test/default :begin-test-var] [m]
  #_(println (gstring/format "--------\n:begin-test-var:   %s\n---------\n" (testing-vars-str m))))

(defmethod report [:cljs.test/default :end-test-var] [m]
  #_(println (gstring/format "--------\n:end-test-var:   %s\n---------\n" (testing-vars-str m)))
  #_(pprint (get-current-env)))

(doo-tests
 'editors.main-t
 'atomist.npm-t
 'atomist.impact-t
 'atomist.deps-t
 'atomist.goals-t)

(comment
  (run-all-tests))