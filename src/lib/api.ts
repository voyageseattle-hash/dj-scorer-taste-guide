export async function apiRequest<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "same-origin", body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The taste service could not finish.");
  return data as T;
}
