"""Shared look and feel for Galatura desktop applications."""

from __future__ import annotations

from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication

ACCENT = "#2f9e6e"
ACCENT_HOVER = "#37b57f"
DANGER = "#d9534f"
WARNING = "#d9a441"
BACKGROUND = "#0f1720"
SURFACE = "#16212b"
SURFACE_ALT = "#1d2b37"
BORDER = "#2a3b49"
TEXT = "#e6edf3"
MUTED = "#8aa0b2"

STYLESHEET = f"""
* {{
    font-family: "Segoe UI", "Inter", "Noto Sans", sans-serif;
    font-size: 10pt;
    color: {TEXT};
}}
QWidget {{
    background-color: {BACKGROUND};
}}
QMainWindow, QDialog {{
    background-color: {BACKGROUND};
}}
QFrame#Card, QFrame#Panel {{
    background-color: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 10px;
}}
QLabel#Title {{
    font-size: 20pt;
    font-weight: 700;
}}
QLabel#PageTitle {{
    font-size: 16pt;
    font-weight: 700;
}}
QLabel#Subtitle, QLabel#Muted {{
    color: {MUTED};
}}
QLabel#StatValue {{
    font-size: 22pt;
    font-weight: 700;
    color: {ACCENT_HOVER};
}}
QLabel#StatLabel {{
    color: {MUTED};
    font-size: 9pt;
    text-transform: uppercase;
}}
QPushButton {{
    background-color: {SURFACE_ALT};
    border: 1px solid {BORDER};
    border-radius: 6px;
    padding: 7px 14px;
}}
QPushButton:hover {{
    border-color: {ACCENT};
}}
QPushButton:disabled {{
    color: #5d7080;
    border-color: #22313d;
}}
QPushButton#Primary {{
    background-color: {ACCENT};
    border-color: {ACCENT};
    color: white;
    font-weight: 600;
}}
QPushButton#Primary:hover {{
    background-color: {ACCENT_HOVER};
}}
QPushButton#Danger {{
    background-color: transparent;
    border-color: {DANGER};
    color: #ff8b87;
}}
QPushButton#Danger:hover {{
    background-color: rgba(217, 83, 79, 0.15);
}}
QPushButton#Ghost {{
    background-color: transparent;
    border-color: transparent;
    color: {MUTED};
}}
QPushButton#Ghost:hover {{
    color: {TEXT};
    background-color: {SURFACE_ALT};
}}
QPushButton#Nav {{
    text-align: left;
    padding: 10px 16px;
    background-color: transparent;
    border: none;
    border-radius: 6px;
    color: {MUTED};
}}
QPushButton#Nav:hover {{
    background-color: {SURFACE_ALT};
    color: {TEXT};
}}
QPushButton#Nav:checked {{
    background-color: rgba(47, 158, 110, 0.18);
    color: {ACCENT_HOVER};
    font-weight: 600;
}}
QLineEdit, QComboBox, QDateEdit, QDateTimeEdit, QSpinBox, QDoubleSpinBox, QTextEdit {{
    background-color: {SURFACE_ALT};
    border: 1px solid {BORDER};
    border-radius: 6px;
    padding: 6px 9px;
    selection-background-color: {ACCENT};
}}
QLineEdit:focus, QComboBox:focus, QDateEdit:focus, QSpinBox:focus,
QDoubleSpinBox:focus, QTextEdit:focus {{
    border-color: {ACCENT};
}}
QComboBox QAbstractItemView {{
    background-color: {SURFACE_ALT};
    border: 1px solid {BORDER};
    selection-background-color: {ACCENT};
    outline: none;
}}
QTableWidget, QListWidget, QTreeWidget {{
    background-color: {SURFACE};
    alternate-background-color: {SURFACE_ALT};
    border: 1px solid {BORDER};
    border-radius: 8px;
    gridline-color: {BORDER};
    selection-background-color: rgba(47, 158, 110, 0.25);
    selection-color: {TEXT};
}}
QTableWidget::item {{
    padding: 6px;
}}
QHeaderView::section {{
    background-color: {SURFACE_ALT};
    color: {MUTED};
    border: none;
    border-bottom: 1px solid {BORDER};
    padding: 7px;
    font-weight: 600;
}}
QTabWidget::pane {{
    border: 1px solid {BORDER};
    border-radius: 8px;
    background-color: {SURFACE};
}}
QTabBar::tab {{
    background: transparent;
    color: {MUTED};
    padding: 8px 16px;
    border-bottom: 2px solid transparent;
}}
QTabBar::tab:selected {{
    color: {TEXT};
    border-bottom-color: {ACCENT};
}}
QCheckBox::indicator, QRadioButton::indicator {{
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid {BORDER};
    background-color: {SURFACE_ALT};
}}
QCheckBox::indicator:checked {{
    background-color: {ACCENT};
    border-color: {ACCENT};
}}
QScrollBar:vertical {{
    background: transparent;
    width: 10px;
    margin: 2px;
}}
QScrollBar::handle:vertical {{
    background: #33475a;
    border-radius: 5px;
    min-height: 24px;
}}
QScrollBar::handle:vertical:hover {{
    background: #405a70;
}}
QScrollBar:horizontal {{
    background: transparent;
    height: 10px;
    margin: 2px;
}}
QScrollBar::handle:horizontal {{
    background: #33475a;
    border-radius: 5px;
    min-width: 24px;
}}
QScrollBar::add-line, QScrollBar::sub-line {{
    width: 0;
    height: 0;
}}
QProgressBar {{
    background-color: {SURFACE_ALT};
    border: 1px solid {BORDER};
    border-radius: 4px;
    text-align: center;
}}
QProgressBar::chunk {{
    background-color: {ACCENT};
    border-radius: 4px;
}}
QToolTip {{
    background-color: {SURFACE_ALT};
    color: {TEXT};
    border: 1px solid {BORDER};
    padding: 4px;
}}
QFrame#Banner {{
    border-radius: 6px;
    padding: 8px;
}}
QFrame#BannerError {{
    background-color: rgba(217, 83, 79, 0.16);
    border: 1px solid {DANGER};
}}
QFrame#BannerSuccess {{
    background-color: rgba(47, 158, 110, 0.16);
    border: 1px solid {ACCENT};
}}
QFrame#BannerInfo {{
    background-color: rgba(217, 164, 65, 0.14);
    border: 1px solid {WARNING};
}}
QSplitter::handle {{
    background-color: {BORDER};
}}
"""


def apply_theme(app: QApplication) -> None:
    app.setStyle("Fusion")

    palette = QPalette()
    palette.setColor(QPalette.ColorRole.Window, QColor(BACKGROUND))
    palette.setColor(QPalette.ColorRole.WindowText, QColor(TEXT))
    palette.setColor(QPalette.ColorRole.Base, QColor(SURFACE))
    palette.setColor(QPalette.ColorRole.AlternateBase, QColor(SURFACE_ALT))
    palette.setColor(QPalette.ColorRole.Text, QColor(TEXT))
    palette.setColor(QPalette.ColorRole.Button, QColor(SURFACE_ALT))
    palette.setColor(QPalette.ColorRole.ButtonText, QColor(TEXT))
    palette.setColor(QPalette.ColorRole.Highlight, QColor(ACCENT))
    palette.setColor(QPalette.ColorRole.HighlightedText, QColor("#ffffff"))
    palette.setColor(QPalette.ColorRole.ToolTipBase, QColor(SURFACE_ALT))
    palette.setColor(QPalette.ColorRole.ToolTipText, QColor(TEXT))
    app.setPalette(palette)
    app.setStyleSheet(STYLESHEET)
