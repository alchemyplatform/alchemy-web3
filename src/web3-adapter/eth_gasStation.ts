import https from "https";

export function patchEthGasStation(web3: any): void {
  web3.ethGasSation = (apiKey: string) => {
    return new Promise((resolve, reject) => {
      https.get(
        {
          hostname: "data-api.defipulse.com",
          path: "/api/v1/egs/api/ethgasAPI.json",
          search: `?api-key=${apiKey}`,
        },
        (response) => {
          let data = "";
          response.on("data", (chunk) => {
            data += chunk;
          });

          response.on("end", () => {
            resolve(data);
          });

          response.on("error", (err) => {
            reject(err);
          });
        },
      );
    });
  };
}
