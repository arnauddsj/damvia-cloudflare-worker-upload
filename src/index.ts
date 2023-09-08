const CHUNK_SIZE = 5 * 1024 * 1024;  // Example: 5MB per chunk

interface OneDrivePayload {
    urls: Array<{ url: string, filename: string }>
}

export interface Env {
    MY_BUCKET: {
        createMultipartUpload: (filename: string) => Promise<any>;
    };
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        if (request.method !== "POST") {
            return new Response("Expected a POST request.", { status: 400 });
        }

        const data: OneDrivePayload = await request.json();
        const { urls } = data;

        const transferPromises = urls.map(async (item: { url: string, filename: string }) => {
            try {
                // Create a new multipart upload
                const multipartUpload = await env.MY_BUCKET.createMultipartUpload(item.filename);

                // Fetch the file content from OneDrive URL
                const fileResponse = await fetch(item.url);
                if (!fileResponse.ok) {
                    throw new Error(`Failed to fetch ${item.url}`);
                }
                const fileData = await fileResponse.arrayBuffer();

                // Split the file content into chunks and upload each part
                const chunks = Math.ceil(fileData.byteLength / CHUNK_SIZE);
                const uploadedParts = [];
                for (let i = 0; i < chunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, fileData.byteLength);
                    const chunk = fileData.slice(start, end);

                    const uploadedPart = await multipartUpload.uploadPart(i + 1, chunk);

                    uploadedParts.push({
                        partNumber: uploadedPart.partNumber,
                        etag: uploadedPart.etag
                    });
                }

                // Complete the multipart upload

               await multipartUpload.complete(uploadedParts);

            } catch (error) {
                console.error("Error during file transfer:", error);
                throw error;
            }
        });

        try {
           await Promise.all(transferPromises);
			// Get a list of all files in the bucket
			const listResults = await env.MY_BUCKET.list(); 

			return new Response(listResults.objects, { status: 200 });
			
        } catch (error) {
            return new Response(`File transfer failed: ${error.message}`, { status: 500 });
        }
    }
};
