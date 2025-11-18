import type { Token } from "./parse-types";

export interface VoiceInfo {
  isPassive: boolean;
  passiveSubject?: Token | null;
  agentHead?: Token | null;
}

export function detectVoice(verb: Token | undefined, tokens: Token[]): VoiceInfo {
  if (!verb) {
    return { isPassive: false };
  }

  const passiveSubject = tokens.find(
    tok => tok.head === verb.i && tok.dep === "nsubjpass"
  );

  const auxPass = tokens.some(
    tok => tok.head === verb.i && tok.dep === "auxpass"
  );

  const agentPrep = tokens.find(
    tok =>
      tok.head === verb.i &&
      (tok.dep === "agent" || (tok.dep === "prep" && tok.text.toLowerCase() === "by"))
  );

  let agentHead: Token | null | undefined = null;
  if (agentPrep) {
    agentHead = tokens.find(tok => tok.head === agentPrep.i && tok.dep === "pobj") ?? null;
  }

  const isPassive = Boolean(passiveSubject || auxPass || (verb.tag === "VBN" && agentHead));

  return {
    isPassive,
    passiveSubject,
    agentHead
  };
}
