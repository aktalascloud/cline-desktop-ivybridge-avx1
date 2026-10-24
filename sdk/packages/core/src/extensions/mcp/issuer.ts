/** Same URL comparison as the patched MCP SDK; never treat missing issuers as bound. */
export function sameOAuthIssuer(left: unknown, right: unknown): boolean {
	if (typeof left !== "string" || typeof right !== "string" || !left || !right)
		return false;
	let a = left,
		b = right;
	try {
		a = new URL(left).href;
		b = new URL(right).href;
	} catch {
		/* Non-URLs remain exact identifiers. */
	}
	return (
		a === b ||
		(a.endsWith("/") && a.slice(0, -1) === b) ||
		(b.endsWith("/") && b.slice(0, -1) === a)
	);
}
