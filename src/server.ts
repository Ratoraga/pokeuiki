import indexPage from "./frontend/index.html";
import criarPage from "./frontend/criar.html";
import explorarPage from "./frontend/explorar.html";
import timePage from "./frontend/time.html";
import batalhaPage from "./frontend/batalha.html";
import pokedexPage from "./frontend/pokedex.html";
import { config } from "./config";
import { error } from "./http";
import { login, register } from "./routes/auth";
import { getBattleTeamRoute, getMovesRoute, getTypeChartRoute } from "./routes/battle";
import { getPokemon, listAllItems, listAllPokemon } from "./routes/pokemon";
import {
  addMember,
  copyTeam,
  createTeam,
  deleteTeam,
  getTeam,
  getTeamAnalysis,
  listMyTeams,
  removeMember,
  updateMember,
} from "./routes/teams";
import { listUserTeams } from "./routes/users";

const server = Bun.serve({
  port: config.port,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": indexPage,
    "/criar": criarPage,
    "/explorar": explorarPage,
    "/time": timePage,
    "/batalha": batalhaPage,
    "/pokedex": pokedexPage,

    "/auth/register": { POST: register },
    "/auth/login": { POST: login },

    "/pokemon": { GET: listAllPokemon },
    "/pokemon/:id": { GET: getPokemon },
    "/items": { GET: listAllItems },

    "/users/:username/teams": { GET: listUserTeams },

    "/teams": { POST: createTeam },
    "/teams/mine": { GET: listMyTeams },
    "/teams/:id": { GET: getTeam, DELETE: deleteTeam },
    "/teams/:id/analysis": { GET: getTeamAnalysis },
    "/teams/:id/copy": { POST: copyTeam },
    "/teams/:id/members": { POST: addMember },
    "/teams/:id/members/:memberId": { PUT: updateMember, DELETE: removeMember },

    "/battle/teams/:id": { GET: getBattleTeamRoute },
    "/battle/chart": { GET: getTypeChartRoute },
        "/battle/moves": { GET: getMovesRoute }
  },
  fetch() {
    return error("Rota não encontrada", 404);
  },
  error(err) {
    console.error(err);
    return error("Erro interno do servidor", 500);
  },
});

console.log(`pokewiki rodando em ${server.url}`);