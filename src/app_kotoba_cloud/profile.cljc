(ns app-kotoba-cloud.profile)

(def schema "https://kotoba.cloud/schemas/control-plane/v1")
(def reference-package-catalog-cid
  "bafkreidcy5stqvnyfpmud6ozz5qz3supd3r3uzk7glmntuv36ezliaxstm")

(def control-plane
  {:schema schema
   :service "kotoba-cloud"
   :version "1"
   :roles
   {:identity {:origin "https://auth.kotoba.cloud"
               :rpId "auth.kotoba.cloud"
               :purpose "stable-principal-and-controller-authentication"}
    :control {:origin "https://api.kotoba.cloud"
              :purpose "cli-and-deploy-control"}
    :storage {:origin "https://kotobase.net"
              :purpose "content-addressed-artifacts-state-and-receipts"}
    :compute {:origin "https://api.murakumo.cloud"
              :publicOrigin "https://murakumo.cloud"
              :purpose "cpu-gpu-placement-and-execution"}
    :agentWork {:origin "https://itonami.cloud"
                :purpose "agent-workspaces-goals-tools-and-approvals"}
    :language {:origin "https://kotoba-lang.org"
               :purpose "language-specification-documentation-and-conformance"}}
   :deploy
   {:mode "local-admission-remote-compute"
    :hostedApply false
    :controlOrigin "https://api.kotoba.cloud"
    :storageOrigin "https://kotobase.net"
    :computeOrigin "https://api.murakumo.cloud"
    :publicComputeOrigin "https://murakumo.cloud"
    :agentWorkOrigin "https://itonami.cloud"}
   :libraries
   {:catalogOrigin "https://kotoba-lang.org"
    :catalogPath "/libraries/"
    :machineCatalogPath "/.well-known/kotoba-libraries.json"
    :packageRegistryPath "/.well-known/kotoba-package-registry.edn"
    :packageRegistryCid reference-package-catalog-cid
    :packageSignatureSuite "ed25519+ml-dsa-65"
    :storageOrigin "https://kotobase.net"
    :releaseSchema "kotoba.library-release.v1"
    :availabilityProofSchema "kotoba.library-availability.v1"
    :minimumByteCompleteStorageProviders 2
    :minimumRoutedPeerIds 2
    :inspectCommand "kotoba library inspect"
    :publishCommand "kotoba library publish"
    :verifyCommand "kotoba library verify"
    :runCommand "kotoba library run"
    :installCommand (str "kotoba package add --catalog-cid " reference-package-catalog-cid)
    :runLockedCommand "kotoba package run"
    :publishMode "local-signed-passkey-relay-distributed-gated"
    :defaultDryRun true
    :hostedPasskeyPublish true
    :hostedPublishEndpoint "https://kotoba.cloud/v1/libraries/publish"
    :requestSchema "https://kotoba.cloud/schemas/library-publication-request/v1"}
   :security
   {:passkeyRpId "auth.kotoba.cloud"
    :passkeyOrigin "https://auth.kotoba.cloud"
    :sessionCookieScope "registrable-domain:kotoba.cloud"
    :sessionProjection "https://kotoba.cloud/v1/session"
    :untrustedDeploymentsUnderKotobaCloud false}})

(defn valid-profile?
  [profile]
  (and (= schema (:schema profile))
       (= "https://auth.kotoba.cloud" (get-in profile [:roles :identity :origin]))
       (= "auth.kotoba.cloud" (get-in profile [:roles :identity :rpId]))
       (= "registrable-domain:kotoba.cloud"
          (get-in profile [:security :sessionCookieScope]))
       (= "https://kotoba.cloud/v1/session"
          (get-in profile [:security :sessionProjection]))
       (= "https://kotobase.net" (get-in profile [:roles :storage :origin]))
       (= "https://api.murakumo.cloud" (get-in profile [:roles :compute :origin]))
       (= "https://itonami.cloud" (get-in profile [:roles :agentWork :origin]))
       (false? (get-in profile [:deploy :hostedApply]))
       (= "https://kotoba-lang.org" (get-in profile [:libraries :catalogOrigin]))
       (= "https://kotobase.net" (get-in profile [:libraries :storageOrigin]))
       (= reference-package-catalog-cid
          (get-in profile [:libraries :packageRegistryCid]))
       (= "ed25519+ml-dsa-65"
          (get-in profile [:libraries :packageSignatureSuite]))
       (= 2 (get-in profile [:libraries :minimumByteCompleteStorageProviders]))
       (= 2 (get-in profile [:libraries :minimumRoutedPeerIds]))
       (true? (get-in profile [:libraries :defaultDryRun]))
       (true? (get-in profile [:libraries :hostedPasskeyPublish]))))
