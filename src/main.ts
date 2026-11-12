const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing #app element");

app.innerHTML = `
  <h1>Any Other Business</h1>
  <p>Foundations are working. Loaded at ${new Date().toLocaleTimeString("en-GB")}.</p>
`;
