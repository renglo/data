from renglo.auth.auth_controller import AuthController
from renglo.blueprint.blueprint_controller import BlueprintController
from renglo.common import load_config
from renglo.data.data_controller import DataController
from renglo.logger import get_logger


class InitializeExtension:
    """
    Per-org setup when a team is assigned to Data.

    Add steps here without changing the platform.
    """

    CONFIG_RING = "data_config"
    SINGLETON_ID = "00000000-0000-0000-0000-000000000000"

    def __init__(self):
        config = load_config()
        self.config = config
        self.DAC = DataController(config=config)
        self.AUC = AuthController(config=config)
        self.BPC = BlueprintController(config=config)
        self.logger = get_logger()

    def run(self, payload):
        payload = payload or {}
        org = str(payload.get("org") or "").strip()
        portfolio = str(payload.get("portfolio") or "").strip()
        if not org:
            return {
                "success": False,
                "action": "initialize_extension",
                "message": "org is required",
                "input": payload,
            }
        if not portfolio:
            return {
                "success": False,
                "action": "initialize_extension",
                "message": "portfolio is required",
                "input": payload,
            }

        results = []
        config_step = self.ensure_config(portfolio, org, payload)
        results.append(config_step)
        if not config_step.get("success"):
            return {
                "success": False,
                "action": "initialize_extension",
                "message": "Data initialization failed",
                "input": payload,
                "output": results,
            }

        return {
            "success": True,
            "action": "initialize_extension",
            "message": "Data initialized",
            "input": payload,
            "output": results,
        }

    def ensure_config(self, portfolio, org, payload):
        action = "ensure_config"
        existing = self.DAC.DAM.get_a_b_c(
            portfolio, org, self.CONFIG_RING, self.SINGLETON_ID
        )
        if existing and "error" not in existing:
            return {
                "success": True,
                "action": action,
                "message": "Config already exists",
                "input": {"portfolio": portfolio, "org": org},
            }

        blueprint = self.BPC.get_blueprint("irma", self.CONFIG_RING, "last")
        if (
            not isinstance(blueprint, dict)
            or blueprint.get("success") is False
            or "fields" not in blueprint
        ):
            return {
                "success": True,
                "action": action,
                "message": f"No config blueprint for {self.CONFIG_RING}",
                "input": {"portfolio": portfolio, "org": org},
            }

        config_doc = {}
        for field in blueprint.get("fields") or []:
            name = field.get("name")
            if not name:
                continue
            config_doc[name] = (
                payload[name] if name in payload else field.get("default")
            )

        try:
            item = self.DAC.construct_post_item(
                portfolio, org, self.CONFIG_RING, config_doc
            )
        except ValueError as exc:
            self.logger.warning("initialize_extension could not build config: %s", exc)
            return {
                "success": False,
                "action": action,
                "message": str(exc),
                "input": {"portfolio": portfolio, "org": org},
            }

        response = self.DAC.DAM.post_a_b(portfolio, org, self.CONFIG_RING, item)
        if "error" in response:
            return {
                "success": False,
                "action": action,
                "message": "Could not create config",
                "input": {"portfolio": portfolio, "org": org},
                "output": response,
            }
        return {
            "success": True,
            "action": action,
            "message": "Config created",
            "input": {"portfolio": portfolio, "org": org},
            "output": response,
        }
