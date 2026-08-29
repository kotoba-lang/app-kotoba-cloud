(ns app-kotoba-cloud.test-runner
  (:require [app-kotoba-cloud.profile-test]
            [app-kotoba-cloud.pq-key-lifecycle-test]
            [app-kotoba-cloud.session-test]
            [app-kotoba-cloud.site-test]
            [clojure.test :as test]))

(defn -main [& _]
  (let [result (test/run-tests 'app-kotoba-cloud.profile-test
                               'app-kotoba-cloud.pq-key-lifecycle-test
                               'app-kotoba-cloud.session-test
                               'app-kotoba-cloud.site-test)]
    (when (pos? (+ (:fail result) (:error result)))
      (System/exit 1))))
