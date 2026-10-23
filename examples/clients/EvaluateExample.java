import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Krediwall from Java in ~80 lines — no dependencies, Java 11+.
 * Bank switch teams are overwhelmingly Java, so this is the whole
 * integration: one POST per authorisation, one verdict back.
 *
 * Compile and run against a local gateway:
 *
 *   javac EvaluateExample.java
 *   java EvaluateExample http://localhost:8080 my-secret-token
 *
 * The request/response contract is docs/api/openapi.yaml — import it into
 * your tooling if you generate clients instead of copying this file.
 *
 * What the response fields mean:
 *   verdict       ALLOW | REVIEW | BLOCK — the decision
 *   hits          rules that fired, each with a human "reason" and a
 *                 machine "evidence" object (counts, ratios) for audits
 *   degraded      true = the verdict was computed with reduced coverage
 *                 (a rule threw or the payload was malformed) — treat
 *                 with suspicion, alert on it in aggregate
 *   elapsedMicros engine-side latency; your 5ms budget is 5000
 */
public class EvaluateExample {

    /** One Credit-on-UPI authorisation, in the exact shape the API expects. */
    static final class Transaction {
        final String txnId, creditLineId, payerVpa, payeeVpa;
        final long amountPaise, creditLimitPaise, timestampMs;
        final boolean terminalVerified;

        Transaction(String txnId, String creditLineId, String payerVpa, String payeeVpa,
                    long amountPaise, long creditLimitPaise, long timestampMs, boolean terminalVerified) {
            this.txnId = txnId;
            this.creditLineId = creditLineId;
            this.payerVpa = payerVpa;
            this.payeeVpa = payeeVpa;
            this.amountPaise = amountPaise;
            this.creditLimitPaise = creditLimitPaise;
            this.timestampMs = timestampMs;
            this.terminalVerified = terminalVerified;
        }

        String toJson() {
            return "{\"txnId\":\"" + txnId + "\",\"creditLineId\":\"" + creditLineId + '"' +
                    ",\"payerVpa\":\"" + payerVpa + "\",\"payeeVpa\":\"" + payeeVpa + '"' +
                    ",\"amountPaise\":" + amountPaise +
                    ",\"creditLimitPaise\":" + creditLimitPaise +
                    ",\"timestampMs\":" + timestampMs +
                    ",\"terminalVerified\":" + terminalVerified + "}";
        }
    }

    static final class KrediwallClient {
        private final HttpClient http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(500))
                // A payment authorisation must not wait on a slow firewall:
                // cap the whole call well inside your switch's budget.
                .build();
        private final URI endpoint;
        private final String bearer; // null when the gateway runs without KREDIWALL_API_KEY

        KrediwallClient(String baseUrl, String apiKey) {
            this.endpoint = URI.create(baseUrl + "/v1/evaluate");
            this.bearer = apiKey == null || apiKey.isEmpty() ? null : "Bearer " + apiKey;
        }

        /** Returns the verdict: ALLOW, REVIEW or BLOCK. */
        String evaluate(Transaction txn) throws Exception {
            HttpRequest.Builder req = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofMillis(2_000))
                    .header("content-type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(txn.toJson()));
            if (bearer != null) {
                req.header("authorization", bearer);
            }
            HttpResponse<String> res = http.send(req.build(), HttpResponse.BodyHandlers.ofString());
            switch (res.statusCode()) {
                case 200:
                    return verdictOf(res.body());
                case 401:
                    throw new IllegalStateException("unauthorized — KREDIWALL_API_KEY mismatch");
                case 400:
                    // The body names the offending field; surface it to the caller.
                    throw new IllegalArgumentException("malformed transaction: " + res.body());
                default:
                    throw new IllegalStateException("unexpected status " + res.statusCode() + ": " + res.body());
            }
        }

        /** Minimal extraction — swap for your JSON library in real code. */
        private static String verdictOf(String body) {
            int at = body.indexOf("\"verdict\":\"");
            if (at < 0) {
                throw new IllegalStateException("no verdict in response: " + body);
            }
            int start = at + "\"verdict\":\"".length();
            return body.substring(start, body.indexOf('"', start));
        }
    }

    public static void main(String[] args) throws Exception {
        String baseUrl = args.length > 0 ? args[0] : "http://localhost:8080";
        String apiKey = args.length > 1 ? args[1] : null;
        KrediwallClient client = new KrediwallClient(baseUrl, apiKey);

        // The classic mule-drain shape: big ticket, unverified terminal.
        Transaction txn = new Transaction(
                "t-1", "line-42", "user@okbank", "pos1@ybl",
                4_999_900L, 10_000_000L, System.currentTimeMillis(), false);

        System.out.println("verdict: " + client.evaluate(txn));
        // In your switch: ALLOW → proceed, REVIEW → route to manual review,
        // BLOCK → decline and log the evidence for the fraud team.
    }
}
