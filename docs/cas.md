# Content-Addressed Storage Layer 1 ( `CAS` )

The Content-Addressed Storage (CAS) layer is the foundational layer of CaskFS. Main features and concepts include:

 - It is responsible for storing all files in a content-addressed manner, meaning that each file is stored based on its SHA256 hash. This ensures that identical files are only stored once, saving space and improving efficiency. 
 - A metadata file is stored for each file in CAS, which contains a copy of all additional data stored about the file in the database.  This allows for restoring CaskFS from just the CAS storage layer.  
 - The CAS layer uses a pairtree index to efficiently store and retrieve files based on their SHA256 hash.
 - The CAS layer is designed to be backend-agnostic, allowing for different storage backends such as local disk storage, cloud storage (e.g., AWS S3, Google Cloud Storage), or distributed storage systems.  Currently local disk and Google Cloud Storage are supported.