# Content-Addressed Storage - Layer 1 ( `CAS` )

The Content-Addressed Storage (CAS) layer is the foundational layer of CaskFS.  It separates the 'File System' to how the data is actually stored.

## Key Features

 - **Deduplication**: The Layer 1 is responsible for storing all files in a content-addressed manner, meaning that each file is stored based on its SHA256 hash. This ensures that identical files are only stored once, saving space and improving efficiency. 
 - **Backup Metadata Storage**: A metadata file is stored for each file in CAS, which contains a copy of all additional data stored about the file in the database.  This allows for restoring CaskFS from just the CAS storage layer.  
 - **Efficient Retrieval**: The CAS layer uses a pairtree index to efficiently store and retrieve files based on their SHA256 hash.
 - **Backend-Agnostic Design**: The CAS layer is designed to be backend-agnostic, allowing for different storage backends such as local disk storage, cloud storage (e.g., AWS S3, Google Cloud Storage), or distributed storage systems.  Currently local disk and Google Cloud Storage are supported.
 - **Multiple Buckets**: When using a cloud storage backend, the CAS layer supports multiple buckets to allowing for files to be stored in different cloud storage buckets based on user-defined criteria or path based auto bucketing rules.
 - **Auto Bucket Rules**: When using a cloud storage backend, the CAS layer supports auto bucket rules which allow for files to be automatically assigned to buckets based on their file path.  This is useful for storing different filess in different geographic locations or storage classes based on their path. See the [Auto Path Documentation](auto-path.md) for more details.