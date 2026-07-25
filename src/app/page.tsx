import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BRAND_TAGLINE, BRAND_WORDMARK } from "@/lib/brand";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold">
            {BRAND_WORDMARK}
          </CardTitle>
          <CardDescription>{BRAND_TAGLINE}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            Das Fundament steht: Schriften, Farbtokens und Komponenten folgen
            dem Brand Book. Anmeldung und Workspaces kommen in den nächsten
            Schritten.
          </p>
          <p className="flex items-center gap-2 font-mono text-xs text-ink-soft">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-status-ready"
            />
            phase 0 / task 1a: scaffold bereit
          </p>
        </CardContent>
        <CardFooter>
          <Button type="button">Los geht&apos;s</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
