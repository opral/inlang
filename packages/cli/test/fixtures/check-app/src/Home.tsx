import { m } from "@/generated/paraglide/messages";

export function Home({ name }: { name: string }) {
  return (
    <main>
      <h1>{m.greeting({ name })}</h1>
      <p>{m.some_key()}</p>
      <p>{m.welcome_back()}</p>
      <p>{m.cart_items({ count: 3 })}</p>
    </main>
  );
}
