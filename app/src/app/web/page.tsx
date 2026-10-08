import KnowledgeWebView from "@/components/KnowledgeWeb";
import { buildKnowledgeWeb } from "@/lib/web";

export const dynamic = "force-dynamic";

export default function WebPage() {
  return <KnowledgeWebView web={buildKnowledgeWeb()} />;
}
