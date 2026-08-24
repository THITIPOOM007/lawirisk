declare module 'cloudflare:workers' {
  export const env: {
    MALWARE_SCANNER_VPC?: {
      fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    };
  };
}
