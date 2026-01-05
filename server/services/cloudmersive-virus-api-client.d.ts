declare module "cloudmersive-virus-api-client" {
  export class ApiClient {
    static instance: ApiClient;
    authentications: {
      Apikey: {
        apiKey: string | undefined;
      };
    };
  }

  export class ScanApi {
    scanFile(buffer: Buffer, callback: (error: any, data: any) => void): void;
  }

  const CloudmersiveVirusApiClient: {
    ApiClient: typeof ApiClient;
    ScanApi: typeof ScanApi;
  };

  export default CloudmersiveVirusApiClient;
}
