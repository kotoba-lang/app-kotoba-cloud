(ns app-kotoba-cloud.boot)

(def schema "https://kotoba.cloud/schemas/aiueos-boot-catalog/v1")
(def origin "https://boot.kotoba.cloud")
(def catalog-path "/.well-known/aiueos-boot.json")
(def bootstrap-path "/aiueos/x86_64/gmktec-k16/bootstrap/v1.efi")

(def loader
  {:kind "loader"
   :bytes 744448
   :sha256 "aad19f3e0759e8a2803659e8d3af3c717d7af423f09f93884c006f7dc5818a84"
   :sha256Base64 "qtGfPgdZ6KKANlno0688cX169CPwn5OITABvfcWBioQ="
   :cid "bafkreifk2gpt4b2z5criansz5dj26pdrpv5pii7qt6jyqtaan564lamkqq"
   :sourceUrl "https://bafkreifk2gpt4b2z5criansz5dj26pdrpv5pii7qt6jyqtaan564lamkqq.ipfs.kotobase.net/?format=raw"})

(def artifacts
  [loader
   {:kind "kernel"
    :bytes 713280
    :sha256 "d79315e93c7b04fa174da3a84e41f942c014bf3b6453f5bc258d85bb96000463"
    :cid "bafkreigxsmk6spd3at5botndvbhed6kcyakl6o3ekp23yjmnqw5zmaaemm"
    :sourceUrl "https://ipfs.kotobase.net/ipfs/bafkreigxsmk6spd3at5botndvbhed6kcyakl6o3ekp23yjmnqw5zmaaemm"}
   {:kind "initramfs"
    :bytes 9604
    :sha256 "27886ff0b194dcd0c66ac22100b5863c92d891b23253366e8579c5b8075c5511"
    :cid "bafkreibhrbx7bmmu3timm2wceeallbr4slmjdmrskm3g5blzyw4aoxcvce"
    :sourceUrl "https://ipfs.kotobase.net/ipfs/bafkreibhrbx7bmmu3timm2wceeallbr4slmjdmrskm3g5blzyw4aoxcvce"}])

(def manifest-cid
  "bafkreidoda772r75zjksrkieq62ow5vf75sgoyhbktkrvmpbylhptm6nwi")
(def channel-ipns
  "k51qzi5uqu5dgygymic1xyzizaigh10gn3qlr48u5eb073lnnnyonjxkr31g9z")

(def catalog
  {:schema schema
   :status "candidate"
   :channel "k16-candidate"
   :sequence 1
   :releasedAt "2026-09-01T04:05:04.000Z"
   :target {:architecture "x86_64"
            :machine "gmktec-k16"
            :firmwareProtocol "uefi-http-boot"}
   :bootstrap {:url (str origin bootstrap-path)
               :path bootstrap-path
               :bytes (:bytes loader)
               :sha256 (:sha256 loader)
               :cid (:cid loader)
               :immutableSource (:sourceUrl loader)}
   :update {:manifestCid manifest-cid
            :manifestUrl (str "https://ipfs.kotobase.net/ipfs/" manifest-cid)
            :ipnsName channel-ipns
            :channelUrl (str "https://" channel-ipns ".ipns.itonami.cloud/")
            :signatureSuite "ipns-ed25519+manifest-ml-dsa-65"
            :antiRollback "monotonic-release-sequence"
            :artifacts artifacts}
   :distribution {:immutableOrigin "https://ipfs.kotobase.net"
                  :mutableNameSystem "ipns"
                  :providerIndex "https://ipni.kotobase.net"
                  :providerAdvertisement "not-advertised"}
   :qualification {:physicalK16 "unverified"
                   :secureBoot "not-enrolled"
                   :nativeHttpsArtifactFetch "not-yet-implemented"
                   :nativeNvmeOsSlotWriter "not-yet-implemented"
                   :internalDiskWrites false}
   :source {:repository "https://github.com/kotoba-lang/aiueos"
            :commit "9f6745ca6bf291752f30ceed56d3d1daa302199c"
            :dirty false}})

(defn valid-catalog? [value]
  (and (= schema (:schema value))
       (= "candidate" (:status value))
       (= "gmktec-k16" (get-in value [:target :machine]))
       (= origin (subs (get-in value [:bootstrap :url])
                       0 (count origin)))
       (= (:cid loader) (get-in value [:bootstrap :cid]))
       (= (:sha256 loader) (get-in value [:bootstrap :sha256]))
       (= (:bytes loader) (get-in value [:bootstrap :bytes]))
       (= manifest-cid (get-in value [:update :manifestCid]))
       (= channel-ipns (get-in value [:update :ipnsName]))
       (= "ipns-ed25519+manifest-ml-dsa-65"
          (get-in value [:update :signatureSuite]))
       (= "unverified" (get-in value [:qualification :physicalK16]))
       (false? (get-in value [:qualification :internalDiskWrites]))))
