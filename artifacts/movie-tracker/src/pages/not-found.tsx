import { Layout } from "@/components/layout";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <Layout>
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 text-center">
        <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mb-6">
          <span className="text-4xl font-mono text-primary font-bold">404</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Scene Missing</h1>
        <p className="text-muted-foreground max-w-md mx-auto mb-8">
          The page you're looking for has been cut from the final edit. It might have been deleted or the URL is incorrect.
        </p>
        <Link href="/" className="inline-flex items-center justify-center h-10 px-6 rounded-md bg-primary text-primary-foreground font-medium transition-colors hover:bg-primary/90">
          Return to Vault
        </Link>
      </div>
    </Layout>
  );
}