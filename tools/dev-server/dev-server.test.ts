import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./dev-server.sh", import.meta.url));

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "dev-server-test-"));
});

afterEach(() => {
  if (existsSync(stateDir)) {
    for (const name of readdirSync(stateDir)) {
      if (name.endsWith(".pid")) {
        script(["stop", name.slice(0, -".pid".length)]);
      }
    }
  }
  rmSync(stateDir, { recursive: true, force: true });
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("could not determine a free port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function script(
  args: string[],
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      DEV_SERVER_STATE_DIR: stateDir,
      DEV_SERVER_START_TIMEOUT: "15",
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function serverCommand(port: number): string[] {
  return [
    "node",
    "-e",
    "require('node:http').createServer((q,s)=>s.end('ok')).listen(Number(process.argv[1]))",
    String(port),
  ];
}

async function answers(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const body = await response.text();
    return body === "ok";
  } catch {
    return false;
  }
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return await predicate();
}

describe("dev-server.sh", () => {
  it(
    "stop ends the server it started and leaves another started one running",
    async () => {
      const [portA, portB] = await Promise.all([freePort(), freePort()]);

      const startA = script(["start", String(portA), "--", ...serverCommand(portA)]);
      expect(startA.status).toBe(0);
      expect(startA.stdout).toContain(`started ${portA}`);

      const startB = script(["start", String(portB), "--", ...serverCommand(portB)]);
      expect(startB.status).toBe(0);
      expect(startB.stdout).toContain(`started ${portB}`);

      const stopA = script(["stop", String(portA)]);
      expect(stopA.status).toBe(0);
      expect(stopA.stdout).toContain("stopped " + portA);

      expect(await answers(portA)).toBe(false);
      expect(await answers(portB)).toBe(true);

      const stopB = script(["stop", String(portB)]);
      expect(stopB.status).toBe(0);
    },
    30000,
  );

  it(
    "stop refuses a port it did not start and kills nothing",
    async () => {
      const portC = await freePort();
      const child = spawn(serverCommand(portC)[0], serverCommand(portC).slice(1));
      try {
        await waitUntil(() => answers(portC), 10000);

        const stopC = script(["stop", String(portC)]);
        expect(stopC.status).toBe(2);
        expect(stopC.stderr).toContain("no pid file");

        expect(await answers(portC)).toBe(true);
      } finally {
        child.kill();
      }
    },
    30000,
  );

  it(
    "start refuses a port already in use",
    async () => {
      const portD = await freePort();
      const child = spawn(serverCommand(portD)[0], serverCommand(portD).slice(1));
      try {
        await waitUntil(() => answers(portD), 10000);

        const startD = script(["start", String(portD), "--", ...serverCommand(portD)]);
        expect(startD.status).toBe(4);
        expect(startD.stderr).toContain("did not start");
        expect(existsSync(join(stateDir, `${portD}.pid`))).toBe(false);

        expect(await answers(portD)).toBe(true);
      } finally {
        child.kill();
      }
    },
    30000,
  );

  it(
    "status follows start and stop",
    async () => {
      const portE = await freePort();

      const startE = script(["start", String(portE), "--", ...serverCommand(portE)]);
      expect(startE.status).toBe(0);

      const statusRunning = script(["status", String(portE)]);
      expect(statusRunning.status).toBe(0);
      expect(statusRunning.stdout).toContain(`running ${portE}`);

      const stopE = script(["stop", String(portE)]);
      expect(stopE.status).toBe(0);

      const statusStopped = script(["status", String(portE)]);
      expect(statusStopped.status).toBe(1);
      expect(statusStopped.stdout).toContain(`stopped ${portE}`);
    },
    30000,
  );

  it(
    "start reports a command that exits before listening",
    async () => {
      const portF = await freePort();

      const startF = script(["start", String(portF), "--", "node", "-e", "process.exit(3)"]);
      expect(startF.status).toBe(5);
      expect(startF.stderr).toContain("exited before listening");
      expect(existsSync(join(stateDir, `${portF}.pid`))).toBe(false);
    },
    30000,
  );

  it(
    "start with a bad port is a usage error",
    () => {
      const startBad = script(["start", "abc", "--", "node", "-e", ""]);
      expect(startBad.status).toBe(64);
      expect(startBad.stderr.startsWith("usage:")).toBe(true);
    },
    30000,
  );

  it(
    "stop never signals a pid it cannot prove it started",
    async () => {
      const port = await freePort();
      const child = spawn(serverCommand(port)[0], serverCommand(port).slice(1), {
        detached: true,
        stdio: "ignore",
      });
      try {
        expect(await waitUntil(() => answers(port), 10000)).toBe(true);

        writeFileSync(join(stateDir, port + ".pid"), child.pid + "\n");

        const result = script(["stop", String(port)]);
        expect(result.status).toBe(7);
        expect(result.stderr).toContain("did not start");
        expect(await answers(port)).toBe(true);
        expect(existsSync(join(stateDir, port + ".pid"))).toBe(false);
      } finally {
        child.kill();
      }
    },
    30000,
  );
});
