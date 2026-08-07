export default {
  async fetch(request) {
    return new Response(JSON.stringify({
      marker: "NEW_WORKER_2026",
      path: new URL(request.url).pathname
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
};
