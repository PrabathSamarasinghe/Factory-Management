"""Application entry point for the Galatura admin console."""

from __future__ import annotations

import logging
import sys

from galatura_desktop_core import SessionManager, apply_theme
from galatura_desktop_core.widgets import run_async
from PySide6.QtCore import QObject, Slot
from PySide6.QtWidgets import QApplication

from .login_window import LoginWindow
from .main_window import MainWindow

logger = logging.getLogger(__name__)


class AdminApplication(QObject):
    def __init__(self, app: QApplication):
        super().__init__()
        self.app = app
        self.session = SessionManager()
        self.login_window = LoginWindow(self.session)
        self.main_window: MainWindow | None = None

        self.session.logged_in.connect(self._on_logged_in)
        self.session.logged_out.connect(self._on_logged_out)

        self.login_window.show()
        self._restore_session()

    def _restore_session(self) -> None:
        run_async(self.session.restore, None, self._on_restore_failed)

    def _on_restore_failed(self, error: BaseException) -> None:
        logger.debug("No stored session to restore: %s", error)

    @Slot(dict)
    def _on_logged_in(self, _profile: dict) -> None:
        previous = self.main_window
        self.main_window = MainWindow(self.session)
        self.main_window.show()
        self.login_window.hide()
        if previous is not None:
            previous.close()
            previous.deleteLater()

    @Slot()
    def _on_logged_out(self) -> None:
        self.login_window.reset()
        self.login_window.show()
        self.login_window.raise_()
        self.login_window.activateWindow()
        if self.main_window is not None:
            self.main_window.close()
            self.main_window.deleteLater()
            self.main_window = None


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    app = QApplication(sys.argv)
    app.setApplicationName("Galatura Admin Console")
    app.setOrganizationName("Galatura")
    apply_theme(app)

    controller = AdminApplication(app)
    app._controller = controller  # type: ignore[attr-defined]
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
